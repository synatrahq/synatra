import { Show, createSignal, createEffect, createMemo } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { PencilSimple, ListBullets, Warning } from "phosphor-solid-js"
import type { AgentModelConfig, ModelProvider, ReasoningConfig } from "@synatra/core/types"
import { Input, Select, CollapsibleSection, FormField, Tooltip } from "../../../../ui"
import { api } from "../../../../app"
import { providerOptions, modelPresets, approvalTimeoutOptions, effortOptions, levelOptions } from "./constants"

export type ExecutionLimits = {
  maxIterations?: number
  maxToolCallsPerIteration?: number
  maxActiveTimeMs?: number
  humanRequestTimeoutMs?: number
}

export function ModelInspector(props: {
  model: AgentModelConfig
  limits: ExecutionLimits
  environmentId?: string | null
  onUpdate: (model: AgentModelConfig) => void
  onUpdateLimits: (limits: ExecutionLimits) => void
}) {
  const presets = () => modelPresets[props.model.provider] ?? []
  const [customMode, setCustomMode] = createSignal(false)

  const synatraAiQuery = useQuery(() => ({
    queryKey: ["resources", "managed", "synatra_ai"],
    queryFn: async () => {
      const res = await api.api.resources.managed[":type"].$get({ param: { type: "synatra_ai" } })
      if (!res.ok) throw new Error("Failed to fetch synatra_ai resource")
      return res.json()
    },
    staleTime: 60000,
  }))

  const configuredProviders = createMemo(() => {
    const synatraAi = synatraAiQuery.data
    if (!synatraAi || !props.environmentId) return new Set<ModelProvider>()
    const envConfig = synatraAi.configs.find((c) => c.environmentId === props.environmentId)
    if (!envConfig?.config) return new Set<ModelProvider>()
    const config = envConfig.config as {
      openai?: { hasApiKey?: boolean; enabled?: boolean }
      anthropic?: { hasApiKey?: boolean; enabled?: boolean }
      google?: { hasApiKey?: boolean; enabled?: boolean }
    }
    const isEnabled = (p?: { hasApiKey?: boolean; enabled?: boolean }) => p?.hasApiKey && (p.enabled ?? true)
    const providers: ModelProvider[] = []
    if (isEnabled(config.openai)) providers.push("openai")
    if (isEnabled(config.anthropic)) providers.push("anthropic")
    if (isEnabled(config.google)) providers.push("google")
    return new Set(providers)
  })

  const isProviderConfigured = (provider: ModelProvider) => !props.environmentId || configuredProviders().has(provider)

  const providerOptionsWithStatus = createMemo(() =>
    providerOptions.map((opt) => ({
      ...opt,
      label: isProviderConfigured(opt.value) ? opt.label : `${opt.label} (Not configured)`,
      disabled: false,
    })),
  )

  createEffect(() => {
    const isPreset = presets().some((p) => p.value === props.model.model)
    if (!isPreset && props.model.model) {
      setCustomMode(true)
    }
  })

  const updateField = <K extends keyof AgentModelConfig>(key: K, value: AgentModelConfig[K]) => {
    props.onUpdate({ ...props.model, [key]: value })
  }

  const updateReasoning = (field: keyof ReasoningConfig, value: unknown) => {
    const current = props.model.reasoning ?? {}
    const updated = { ...current, [field]: value || undefined }
    const hasValue = Object.values(updated).some((v) => v !== undefined)
    updateField("reasoning", hasValue ? updated : undefined)
  }

  const handleProviderChange = (provider: ModelProvider) => {
    const defaultModel = modelPresets[provider]?.[0]?.value ?? ""
    props.onUpdate({ ...props.model, provider, model: defaultModel })
    setCustomMode(false)
  }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Provider">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Provider">
            <div class="flex items-center gap-2">
              <Select
                value={props.model.provider}
                options={providerOptionsWithStatus()}
                onChange={handleProviderChange}
              />
              <Show when={!isProviderConfigured(props.model.provider)}>
                <Tooltip content="Configure API key in Resources > Synatra AI">
                  <Warning class="h-4 w-4 text-warning" />
                </Tooltip>
              </Show>
            </div>
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Model">
            <div class="group/model relative">
              <button
                type="button"
                class="absolute -left-6 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-text group-hover/model:opacity-100"
                onClick={() => {
                  if (customMode()) {
                    const first = presets()[0]?.value ?? ""
                    updateField("model", first)
                  }
                  setCustomMode(!customMode())
                }}
                title={customMode() ? "Switch to presets" : "Switch to custom input"}
              >
                <Show when={customMode()} fallback={<PencilSimple class="h-3.5 w-3.5" />}>
                  <ListBullets class="h-3.5 w-3.5" />
                </Show>
              </button>
              <Show
                when={customMode()}
                fallback={
                  <Select value={props.model.model} options={presets()} onChange={(v) => updateField("model", v)} />
                }
              >
                <Input
                  type="text"
                  value={props.model.model}
                  onInput={(e) => updateField("model", e.currentTarget.value)}
                  placeholder="model-id"
                  class="font-code text-xs"
                />
              </Show>
            </div>
          </FormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Temperature">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={props.model.temperature}
              onInput={(e) => updateField("temperature", parseFloat(e.currentTarget.value) || 0.7)}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Top P">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={props.model.topP ?? ""}
              onInput={(e) => {
                const val = parseFloat(e.currentTarget.value)
                updateField("topP", isNaN(val) ? undefined : val)
              }}
              placeholder="1.0"
              class="w-24 text-xs"
            />
          </FormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Reasoning">
        <div class="space-y-3">
          <Show when={props.model.provider === "openai"}>
            <FormField horizontal labelWidth="6rem" label="Effort">
              <Select
                value={props.model.reasoning?.effort ?? ""}
                options={effortOptions}
                onChange={(v) => updateReasoning("effort", v)}
              />
            </FormField>
          </Show>
          <Show when={props.model.provider === "anthropic"}>
            <FormField horizontal labelWidth="6rem" label="Budget">
              <Input
                type="number"
                min="1024"
                max="128000"
                step="1024"
                value={props.model.reasoning?.budgetTokens ?? ""}
                onInput={(e) => {
                  const val = parseInt(e.currentTarget.value)
                  updateReasoning("budgetTokens", isNaN(val) ? undefined : val)
                }}
                placeholder="e.g. 12000"
                class="w-24 text-xs"
              />
            </FormField>
          </Show>
          <Show when={props.model.provider === "google"}>
            <FormField horizontal labelWidth="6rem" label="Level">
              <Select
                value={props.model.reasoning?.level ?? ""}
                options={levelOptions}
                onChange={(v) => updateReasoning("level", v)}
              />
            </FormField>
          </Show>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Limits">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Iterations">
            <Input
              type="number"
              min="1"
              max="100"
              step="1"
              value={props.limits.maxIterations ?? 10}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                props.onUpdateLimits({ ...props.limits, maxIterations: isNaN(val) ? 10 : val })
              }}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Tools/iter">
            <Input
              type="number"
              min="1"
              max="50"
              step="1"
              value={props.limits.maxToolCallsPerIteration ?? 10}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                props.onUpdateLimits({ ...props.limits, maxToolCallsPerIteration: isNaN(val) ? 10 : val })
              }}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Active time (ms)">
            <Input
              type="number"
              min="30000"
              max="3600000"
              step="1000"
              value={props.limits.maxActiveTimeMs ?? 600000}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                props.onUpdateLimits({ ...props.limits, maxActiveTimeMs: isNaN(val) ? 600000 : val })
              }}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Human timeout">
            <Select
              options={approvalTimeoutOptions}
              value={props.limits.humanRequestTimeoutMs ?? 259200000}
              onChange={(v) => props.onUpdateLimits({ ...props.limits, humanRequestTimeoutMs: v })}
              class="w-24 text-xs"
            />
          </FormField>
        </div>
      </CollapsibleSection>
    </div>
  )
}
