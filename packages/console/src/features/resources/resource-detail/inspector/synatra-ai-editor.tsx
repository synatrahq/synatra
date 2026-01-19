import { Show, For, createSignal, createEffect } from "solid-js"
import { CaretRight } from "phosphor-solid-js"
import type { LlmProvider } from "@synatra/core/types"
import { Input, Switch, FormField, FormError } from "../../../../ui"
import type { SynatraAiEditorConfig, SynatraAiProviderEditorConfig } from "../constants"
import { LLM_PROVIDERS } from "./constants"
import { SensitiveInput, ProviderIcon } from "./shared"

export function SynatraAiConfigEditorContent(props: {
  config: SynatraAiEditorConfig
  validationErrors?: Partial<Record<LlmProvider, string>>
  onChange: (config: SynatraAiEditorConfig) => void
  onToggleEnabled?: (provider: LlmProvider, enabled: boolean) => void
}) {
  const [expanded, setExpanded] = createSignal<Set<LlmProvider>>(new Set())

  createEffect(() => {
    const providers = Object.keys(props.validationErrors ?? {}) as LlmProvider[]
    if (providers.length > 0) setExpanded((prev) => new Set([...prev, ...providers]))
  })

  const toggleExpanded = (provider: LlmProvider) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const handleProviderChange = (provider: LlmProvider, update: Partial<SynatraAiProviderEditorConfig>) => {
    props.onChange({ ...props.config, [provider]: { ...props.config[provider], ...update } })
  }

  return (
    <div class="flex flex-col gap-2">
      <For each={LLM_PROVIDERS}>
        {(p) => {
          const config = () => props.config[p.id]
          const isConfigured = () => config().hasApiKey || Boolean(config().apiKey)
          const isExpanded = () => expanded().has(p.id)

          return (
            <div class="rounded-lg border border-border">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                onClick={() => toggleExpanded(p.id)}
              >
                <div class="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted">
                  <ProviderIcon provider={p.id} />
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-text">{p.name}</span>
                    <Show when={isConfigured()}>
                      <span
                        class="rounded-full border px-2 py-0.5 text-2xs font-medium"
                        classList={{
                          "border-success/30 bg-success/10 text-success": config().enabled,
                          "border-border bg-surface-muted text-text-muted": !config().enabled,
                        }}
                      >
                        {config().enabled ? "Active" : "Inactive"}
                      </span>
                    </Show>
                  </div>
                </div>
                <span class="h-4 w-4 text-text-muted transition-transform" classList={{ "rotate-90": isExpanded() }}>
                  <CaretRight class="h-4 w-4" />
                </span>
              </button>

              <Show when={isExpanded()}>
                <div class="border-t border-border/50 px-3 pb-3 pt-3">
                  <div class="flex flex-col gap-3">
                    <FormField label="API Key">
                      <SensitiveInput
                        type="password"
                        value={config().apiKey}
                        hasSaved={config().hasApiKey}
                        placeholder={p.placeholder}
                        onChange={(v) => handleProviderChange(p.id, { apiKey: v })}
                        class="font-code"
                      />
                      <a
                        href={p.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-1 block text-2xs text-accent hover:underline"
                      >
                        Get your API key from {p.name}
                      </a>
                    </FormField>

                    <Show when={props.validationErrors?.[p.id]}>{(error) => <FormError message={error()} />}</Show>

                    <FormField label="Base URL">
                      <Input
                        type="text"
                        value={config().baseUrl ?? ""}
                        placeholder="Custom base URL (optional)"
                        onInput={(e) => handleProviderChange(p.id, { baseUrl: e.currentTarget.value || null })}
                        class="font-code"
                      />
                    </FormField>

                    <Show when={isConfigured()}>
                      <div class="flex items-center justify-between rounded-md bg-surface-muted px-2.5 py-2">
                        <span class="text-xs text-text-muted">Enable this provider</span>
                        <Switch
                          checked={config().enabled}
                          onClick={() => {
                            const newEnabled = !config().enabled
                            handleProviderChange(p.id, { enabled: newEnabled })
                            props.onToggleEnabled?.(p.id, newEnabled)
                          }}
                        />
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          )
        }}
      </For>
    </div>
  )
}
