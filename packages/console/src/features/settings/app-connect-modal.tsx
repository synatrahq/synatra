import { createSignal, createEffect, Show, For } from "solid-js"
import { ComingSoonAppId } from "@synatra/core/types"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Input, FormField, Spinner } from "../../ui"
import { AppIcon } from "../../components"

type AppConnectModalProps = {
  open: boolean
  appId: string | null
  onClose: () => void
  onConnect: (appId: string, name: string) => void
  connecting?: boolean
}

const APP_OPTIONS = [
  { id: "intercom", name: "Intercom" },
  { id: "github", name: "GitHub" },
]

function isComingSoon(appId: string): boolean {
  return ComingSoonAppId.includes(appId as (typeof ComingSoonAppId)[number])
}

export function AppConnectModal(props: AppConnectModalProps) {
  const [selectedAppId, setSelectedAppId] = createSignal<string | null>(null)
  const [name, setName] = createSignal("")
  const [error, setError] = createSignal("")
  const [submitted, setSubmitted] = createSignal(false)

  const effectiveAppId = () => props.appId ?? selectedAppId()
  const appInfo = () => APP_OPTIONS.find((a) => a.id === effectiveAppId())
  const showAppSelection = () => !props.appId && !selectedAppId()

  createEffect(() => {
    if (props.open) {
      setSelectedAppId(null)
      setName("")
      setError("")
      setSubmitted(false)
    }
  })

  const handleConnect = () => {
    if (submitted()) return
    const trimmedName = name().trim()
    if (!trimmedName) {
      setError("Name is required")
      return
    }
    const appId = effectiveAppId()
    if (!appId) return
    setSubmitted(true)
    setError("")
    props.onConnect(appId, trimmedName)
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader
          title={showAppSelection() ? "Connect App" : `Connect ${appInfo()?.name ?? "App"}`}
          onClose={props.onClose}
        />
        <ModalBody>
          <Show when={showAppSelection()}>
            <div class="space-y-2">
              <For each={APP_OPTIONS}>
                {(app) => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    classList={{
                      "hover:border-border-strong hover:bg-surface-muted": !isComingSoon(app.id),
                    }}
                    onClick={() => setSelectedAppId(app.id)}
                    disabled={isComingSoon(app.id)}
                  >
                    <AppIcon appId={app.id} class="h-5 w-5" />
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-medium text-text">{app.name}</span>
                      <Show when={isComingSoon(app.id)}>
                        <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                          Coming soon
                        </span>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={!showAppSelection()}>
            <FormField label="Name" horizontal labelWidth="4.5rem">
              <Input
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder={`My ${appInfo()?.name ?? "App"}`}
              />
            </FormField>
            <Show when={error()}>
              <div class="mt-2 rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-2xs text-danger">
                {error()}
              </div>
            </Show>
          </Show>
        </ModalBody>
        <Show when={!showAppSelection()}>
          <ModalFooter>
            <Show when={!props.appId}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAppId(null)}
                disabled={submitted() || props.connecting}
              >
                Back
              </Button>
            </Show>
            <Show when={props.appId}>
              <Button variant="ghost" size="sm" onClick={props.onClose} disabled={submitted() || props.connecting}>
                Cancel
              </Button>
            </Show>
            <Button size="sm" onClick={handleConnect} disabled={submitted() || props.connecting || !name().trim()}>
              {(submitted() || props.connecting) && <Spinner size="xs" class="border-white border-t-transparent" />}
              {submitted() || props.connecting ? "Connecting..." : "Connect"}
            </Button>
          </ModalFooter>
        </Show>
      </ModalContainer>
    </Modal>
  )
}
