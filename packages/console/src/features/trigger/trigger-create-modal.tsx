import { createSignal, createEffect, Show, For } from "solid-js"
import { generateSlug } from "@synatra/util/identifier"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Input, Spinner, FormField } from "../../ui"
import { EntityIcon } from "../../components"

type AgentOption = {
  id: string
  name: string
  slug: string
  icon: string
  iconColor: string
}

type TriggerCreateModalProps = {
  open: boolean
  agents: AgentOption[]
  onClose: () => void
  onSave: (data: { agentId: string; name: string; slug?: string }) => Promise<void>
  saving?: boolean
}

export function TriggerCreateModal(props: TriggerCreateModalProps) {
  const [step, setStep] = createSignal<"select-agent" | "configure">("select-agent")
  const [selectedAgent, setSelectedAgent] = createSignal<AgentOption | null>(null)
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = createSignal(false)

  createEffect(() => {
    if (props.open) {
      setStep("select-agent")
      setSelectedAgent(null)
      setName("")
      setSlug("")
      setError(null)
      setSlugManuallyEdited(false)
    }
  })

  const handleAgentSelect = (agent: AgentOption) => {
    setSelectedAgent(agent)
    setStep("configure")
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugManuallyEdited()) {
      setSlug(generateSlug(value))
    }
  }

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true)
    setSlug(value)
  }

  const handleBack = () => {
    if (step() === "configure") {
      setStep("select-agent")
      setSelectedAgent(null)
      setError(null)
    }
  }

  const handleSave = async () => {
    const agent = selectedAgent()
    if (!agent) return

    if (!name().trim()) {
      setError("Name is required")
      return
    }

    await props.onSave({
      agentId: agent.id,
      name: name().trim(),
      slug: slug().trim() || undefined,
    })
  }

  const canCreate = () => !!name().trim()

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="lg">
        <ModalHeader
          title="Create trigger"
          onClose={props.onClose}
          onBack={step() !== "select-agent" ? handleBack : undefined}
        />

        <Show when={step() === "select-agent"}>
          <ModalBody>
            <Show
              when={props.agents.length > 0}
              fallback={
                <div class="py-8 text-center text-xs text-text-muted">No agents available. Create an agent first.</div>
              }
            >
              <div class="flex flex-col gap-1">
                <For each={props.agents}>
                  {(agent) => (
                    <button
                      type="button"
                      class="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated p-3 text-left transition-colors hover:border-border-strong"
                      onClick={() => handleAgentSelect(agent)}
                    >
                      <EntityIcon icon={agent.icon} iconColor={agent.iconColor} size={32} />
                      <div class="flex flex-col">
                        <span class="text-xs font-medium text-text">{agent.name}</span>
                        <span class="text-2xs text-text-muted">{agent.slug}</span>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
          </ModalFooter>
        </Show>

        <Show when={step() === "configure"}>
          <ModalBody>
            <Show when={selectedAgent()}>
              {(agent) => (
                <div class="flex items-center gap-2.5">
                  <EntityIcon icon={agent().icon} iconColor={agent().iconColor} size={28} />
                  <div class="flex flex-col">
                    <span class="text-xs font-medium text-text">{agent().name}</span>
                  </div>
                </div>
              )}
            </Show>

            <div class="space-y-3">
              <FormField label="Name" for="trigger-name">
                <Input
                  id="trigger-name"
                  type="text"
                  value={name()}
                  onInput={(e) => handleNameChange(e.currentTarget.value)}
                  placeholder="Payment Webhook"
                  class="h-8 text-xs"
                />
              </FormField>
              <FormField label="Slug (optional)" for="trigger-slug">
                <Input
                  id="trigger-slug"
                  type="text"
                  value={slug()}
                  onInput={(e) => handleSlugChange(e.currentTarget.value)}
                  placeholder="payment-webhook"
                  class="h-8 font-code text-xs"
                />
              </FormField>
            </div>

            <Show when={error()}>
              <div class="rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
                {error()}
              </div>
            </Show>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleSave} disabled={props.saving || !canCreate()}>
              {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
              {props.saving ? "Creating..." : "Create"}
            </Button>
          </ModalFooter>
        </Show>
      </ModalContainer>
    </Modal>
  )
}
