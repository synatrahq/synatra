import { type ParentProps, onMount, createSignal, Show, createMemo } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { Warning, ArrowRight } from "phosphor-solid-js"
import type { LlmProvider, APISynatraAiConfig } from "@synatra/core/types"
import { GlobalNav } from "./global-nav"
import { pendingCount, fetchPendingCount, api, activeOrg } from "../app"
import type { Environments, Resources } from "../app/api"
import { LlmSetupModal } from "../features/onboarding/llm-setup-modal"

type ShellProps = ParentProps

export function Shell(props: ShellProps) {
  const [showLlmModal, setShowLlmModal] = createSignal(false)
  const [savingLlm, setSavingLlm] = createSignal(false)

  onMount(() => {
    fetchPendingCount()
  })

  const environmentsQuery = useQuery(() => ({
    queryKey: ["environments", activeOrg()?.id],
    queryFn: async (): Promise<Environments> => {
      const res = await api.api.environments.$get()
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60000,
    enabled: !!activeOrg()?.id,
  }))

  const resourcesQuery = useQuery(() => ({
    queryKey: ["resources", activeOrg()?.id],
    queryFn: async (): Promise<Resources> => {
      const res = await api.api.resources.$get()
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60000,
    enabled: !!activeOrg()?.id,
  }))

  const productionEnv = createMemo(() => environmentsQuery.data?.find((e) => e.slug === "production"))

  const synatraAiResource = createMemo(() => resourcesQuery.data?.find((r) => r.type === "synatra_ai"))

  const llmConfigured = createMemo(() => {
    const resource = synatraAiResource()
    const prodEnv = productionEnv()
    if (!resource || !prodEnv) return true

    const config = resource.configs?.find((c) => c.environmentId === prodEnv.id)
    if (!config) return false

    const aiConfig = config.config as APISynatraAiConfig | undefined
    if (!aiConfig) return false

    const providers: LlmProvider[] = ["anthropic", "openai", "google"]
    return providers.some((p) => aiConfig[p]?.hasApiKey && aiConfig[p]?.enabled)
  })

  const handleLlmSave = async (provider: LlmProvider, apiKey: string) => {
    setSavingLlm(true)

    const prodEnv = productionEnv()
    if (!prodEnv) {
      setSavingLlm(false)
      throw new Error("Production environment not found")
    }

    let resourceId = synatraAiResource()?.id

    if (!resourceId) {
      const createRes = await api.api.resources.$post({
        json: { name: "Synatra AI", slug: "synatra_ai", type: "synatra_ai", configs: [] },
      })
      if (!createRes.ok) {
        setSavingLlm(false)
        throw new Error("Failed to create LLM resource")
      }
      const created = await createRes.json()
      resourceId = created.id
    }

    const configRes = await api.api.resources[":id"].config.$post({
      param: { id: resourceId },
      json: { environmentId: prodEnv.id, config: { [provider]: { apiKey, enabled: true } } },
    })
    if (!configRes.ok) {
      setSavingLlm(false)
      throw new Error("Failed to save LLM configuration")
    }

    await resourcesQuery.refetch()
    setSavingLlm(false)
    setShowLlmModal(false)
  }

  return (
    <div class="flex h-screen flex-col bg-surface text-text">
      <Show when={!llmConfigured()}>
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 bg-warning px-3 py-1.5 text-warning-contrast transition-colors hover:bg-warning/90"
          onClick={() => setShowLlmModal(true)}
        >
          <Warning size={14} weight="fill" />
          <span class="text-xs font-medium">LLM provider not configured for production</span>
          <span class="flex items-center gap-1 text-xs font-medium">
            Set up now
            <ArrowRight size={12} />
          </span>
        </button>
      </Show>

      <div class="flex flex-1 overflow-hidden">
        <GlobalNav pendingCount={pendingCount()} />
        <div class="flex flex-1 overflow-hidden">
          <div class="flex flex-1 overflow-hidden bg-surface-elevated">{props.children}</div>
        </div>
      </div>

      <LlmSetupModal
        open={showLlmModal()}
        onClose={() => setShowLlmModal(false)}
        onSave={handleLlmSave}
        saving={savingLlm()}
        saveButtonText="Save"
      />
    </div>
  )
}
