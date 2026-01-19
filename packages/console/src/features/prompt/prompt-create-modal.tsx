import { createSignal, createEffect, Show, For } from "solid-js"
import { generateSlug } from "@synatra/util/identifier"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Spinner,
  FormField,
  FormError,
} from "../../ui"
import { EntityIcon } from "../../components"
import type { Agents } from "../../app/api"

type PromptCreateModalProps = {
  open: boolean
  agents: Agents
  onClose: () => void
  onSave: (data: {
    agentId: string
    name: string
    slug?: string
    description?: string
    content: string
  }) => Promise<void>
  saving?: boolean
}

const MAX_DESCRIPTION_LENGTH = 255

export function PromptCreateModal(props: PromptCreateModalProps) {
  const [step, setStep] = createSignal<"select-agent" | "configure">("select-agent")
  const [selectedAgent, setSelectedAgent] = createSignal<Agents[number] | null>(null)
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [content, setContent] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = createSignal(false)

  createEffect(() => {
    if (props.open) {
      setStep("select-agent")
      setSelectedAgent(null)
      setName("")
      setSlug("")
      setDescription("")
      setContent("")
      setError(null)
      setSlugManuallyEdited(false)
    }
  })

  const handleAgentSelect = (agent: Agents[number]) => {
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

  const handleDescriptionChange = (value: string) => {
    if (value.length <= MAX_DESCRIPTION_LENGTH) {
      setDescription(value)
    }
  }

  const handleBack = () => {
    setStep("select-agent")
    setError(null)
  }

  const handleSave = async () => {
    const agent = selectedAgent()
    if (!agent) return

    if (!name().trim()) {
      setError("Name is required")
      return
    }

    try {
      await props.onSave({
        agentId: agent.id,
        name: name().trim(),
        slug: slug().trim() || undefined,
        description: description().trim() || undefined,
        content: content().trim(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create prompt")
    }
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="lg">
        <ModalHeader
          title="Create prompt"
          onClose={props.onClose}
          onBack={step() === "configure" ? handleBack : undefined}
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
            <>
              <Show when={selectedAgent()}>
                {(agent) => (
                  <div class="flex items-center gap-2.5">
                    <EntityIcon icon={agent().icon} iconColor={agent().iconColor} size={28} />
                    <div class="flex flex-col">
                      <span class="text-xs font-medium text-text">{agent().name}</span>
                      <span class="text-2xs text-text-muted">Prompt for this agent</span>
                    </div>
                  </div>
                )}
              </Show>

              <div class="grid grid-cols-2 gap-3">
                <FormField label="Name" for="prompt-name">
                  <Input
                    id="prompt-name"
                    type="text"
                    value={name()}
                    onInput={(e) => handleNameChange(e.currentTarget.value)}
                    placeholder="Customer Support Reply"
                    class="h-8 text-xs"
                  />
                </FormField>
                <FormField label="Slug (optional)" for="prompt-slug">
                  <Input
                    id="prompt-slug"
                    type="text"
                    value={slug()}
                    onInput={(e) => handleSlugChange(e.currentTarget.value)}
                    placeholder="customer-support-reply"
                    class="h-8 font-code text-xs"
                  />
                </FormField>
              </div>

              <FormField label="Description (optional)" for="prompt-desc">
                <Textarea
                  id="prompt-desc"
                  value={description()}
                  onInput={(e) => handleDescriptionChange(e.currentTarget.value)}
                  placeholder="Template for customer support responses"
                  rows={2}
                />
                <span class="block text-right text-[10px] text-text-muted">
                  {description().length}/{MAX_DESCRIPTION_LENGTH}
                </span>
              </FormField>

              <FormError message={error()} />
            </>
          </ModalBody>
          <ModalFooter>
            <>
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleSave} disabled={props.saving || !name().trim()}>
                {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
                {props.saving ? "Creating..." : "Create"}
              </Button>
            </>
          </ModalFooter>
        </Show>
      </ModalContainer>
    </Modal>
  )
}
