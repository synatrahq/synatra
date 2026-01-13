import { createSignal, createEffect, Show, For } from "solid-js"
import { WarningCircle } from "phosphor-solid-js"
import type { LlmProvider } from "@synatra/core/types"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Input, Spinner, FormField } from "../../ui"
import { theme, api } from "../../app"
import openaiLight from "../../assets/images/openai_light.svg"
import openaiDark from "../../assets/images/openai_dark.svg"
import anthropicLight from "../../assets/images/anthropic_light.svg"
import anthropicDark from "../../assets/images/anthropic_dark.svg"
import googleLogo from "../../assets/images/google.svg"

type LlmSetupModalProps = {
  open: boolean
  onClose: () => void
  onSave: (provider: LlmProvider, apiKey: string) => Promise<void>
  saving?: boolean
  skipValidation?: boolean
  saveButtonText?: string
}

const PROVIDERS: { id: LlmProvider; name: string; recommended?: boolean; placeholder: string; helpUrl: string }[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    recommended: true,
    placeholder: "sk-ant-api03-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    name: "Google AI",
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/app/apikey",
  },
]

const PROVIDER_ICONS: Record<LlmProvider, { light: string; dark: string }> = {
  openai: { light: openaiLight, dark: openaiDark },
  anthropic: { light: anthropicLight, dark: anthropicDark },
  google: { light: googleLogo, dark: googleLogo },
}

function ProviderIcon(props: { provider: LlmProvider; class?: string }) {
  const icon = PROVIDER_ICONS[props.provider]
  return <img src={theme() === "dark" ? icon.dark : icon.light} alt="" class={props.class ?? "h-4 w-4"} />
}

export function LlmSetupModal(props: LlmSetupModalProps) {
  const [provider, setProvider] = createSignal<LlmProvider>("anthropic")
  const [apiKey, setApiKey] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [validating, setValidating] = createSignal(false)

  createEffect(() => {
    if (props.open) {
      setProvider("anthropic")
      setApiKey("")
      setError(null)
      setValidating(false)
    }
  })

  const selectedProviderInfo = () => PROVIDERS.find((p) => p.id === provider())!

  const validateKey = async (p: LlmProvider, key: string): Promise<{ valid: boolean; error?: string }> => {
    const res = await api.api.resources["validate-llm-keys"].$post({
      json: { providers: [{ provider: p, apiKey: key, baseUrl: null }] },
    })
    if (!res.ok) return { valid: false, error: "Validation request failed" }
    const results = (await res.json()) as { provider: string; valid: boolean; error?: string }[]
    const result = results.find((r) => r.provider === p)
    return result ?? { valid: false, error: "Validation failed" }
  }

  const handleSave = async () => {
    const key = apiKey().trim()
    if (!key) {
      setError("API key is required")
      return
    }

    setError(null)

    if (!props.skipValidation) {
      setValidating(true)
      const result = await validateKey(provider(), key).catch(() => ({
        valid: false,
        error: "Failed to validate API key",
      }))
      setValidating(false)
      if (!result.valid) {
        setError(result.error || "Invalid API key")
        return
      }
    }

    await props.onSave(provider(), key).catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to save")
    })
  }

  const canSave = () => apiKey().trim().length > 0
  const isProcessing = () => validating() || props.saving

  const buttonText = () => {
    if (validating()) return "Validating..."
    if (props.saving) return "Saving..."
    return props.saveButtonText ?? "Save & Create Agent"
  }

  return (
    <Modal open={props.open} onEscape={props.onClose}>
      <ModalContainer size="md">
        <ModalHeader title="Connect your AI provider" onClose={props.onClose} />

        <ModalBody>
          <p class="text-xs text-text-muted">Your agent needs an LLM to work. We recommend Anthropic Claude.</p>

          <FormField label="Provider">
            <div class="flex flex-col gap-2">
              <For each={PROVIDERS}>
                {(p) => (
                  <button
                    type="button"
                    class="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
                    classList={{
                      "border-accent bg-accent/5": provider() === p.id,
                      "border-border hover:border-border-strong": provider() !== p.id,
                    }}
                    onClick={() => setProvider(p.id)}
                  >
                    <div class="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted">
                      <ProviderIcon provider={p.id} />
                    </div>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-text">{p.name}</span>
                        <Show when={p.recommended}>
                          <span class="rounded bg-accent/10 px-1.5 py-0.5 text-2xs font-medium text-accent">
                            Recommended
                          </span>
                        </Show>
                      </div>
                    </div>
                    <div
                      class="h-4 w-4 rounded-full border-2 transition-colors"
                      classList={{
                        "border-accent bg-accent": provider() === p.id,
                        "border-border": provider() !== p.id,
                      }}
                    >
                      <Show when={provider() === p.id}>
                        <div class="flex h-full w-full items-center justify-center">
                          <div class="h-1.5 w-1.5 rounded-full bg-white" />
                        </div>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </FormField>

          <FormField label="API Key">
            <Input
              type="password"
              value={apiKey()}
              onInput={(e) => setApiKey(e.currentTarget.value)}
              placeholder={selectedProviderInfo().placeholder}
              class="font-code"
            />
            <a
              href={selectedProviderInfo().helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="mt-1 block text-2xs text-accent hover:underline"
            >
              Get your API key from {selectedProviderInfo().name}
            </a>
          </FormField>

          <Show when={error()}>
            <div class="flex items-start gap-2 rounded-lg bg-danger-soft p-2">
              <WarningCircle size={14} weight="fill" class="mt-0.5 shrink-0 text-danger" />
              <p class="text-xs text-danger">{error()}</p>
            </div>
          </Show>
        </ModalBody>

        <ModalFooter>
          <Button variant="default" size="sm" onClick={handleSave} disabled={isProcessing() || !canSave()}>
            {isProcessing() && <Spinner size="xs" class="border-white border-t-transparent" />}
            {buttonText()}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
