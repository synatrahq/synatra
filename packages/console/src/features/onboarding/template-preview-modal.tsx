import { Show, createSignal, For } from "solid-js"
import { useNavigate } from "@solidjs/router"
import type { AgentTemplate } from "@synatra/core/types"
import { api } from "../../app"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Spinner } from "../../ui"
import { getIconComponent, ResourceIcon, ICON_COLORS } from "../../components"
import { DemoPreview } from "./demo-preview"

const RESOURCE_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  firebase: "Firebase",
  graphql: "GraphQL",
  javascript: "JavaScript",
  mongodb: "MongoDB",
  restapi: "REST API",
  stripe: "Stripe",
  github: "GitHub",
  intercom: "Intercom",
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

type TemplatePreviewModalProps = {
  template: AgentTemplate | null
  open: boolean
  onClose: () => void
}

function getIconColor(colorId: string): string {
  return ICON_COLORS.find((c) => c.id === colorId)?.value ?? ICON_COLORS[0].value
}

export function TemplatePreviewModal(props: TemplatePreviewModalProps) {
  const navigate = useNavigate()
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const IconComponent = () => {
    if (!props.template) return null
    const Icon = getIconComponent(props.template.icon)
    return Icon ? <Icon class="h-4 w-4" weight="duotone" /> : null
  }

  const iconColor = () => getIconColor(props.template?.iconColor ?? "gray")

  const scenario = () => props.template?.demoScenarios[0] ?? null

  const handleCreate = async () => {
    const t = props.template
    if (!t) return

    setCreating(true)
    setError(null)

    try {
      const name = t.name
      const slug = generateSlug(name) + "-" + Date.now().toString(36)

      const res = await api.api.agents.$post({
        json: {
          name,
          slug,
          description: t.description,
          icon: t.icon,
          iconColor: t.iconColor,
          templateId: t.id,
          runtimeConfig: {
            model: { provider: "anthropic", model: "claude-sonnet-4-20250514", temperature: 0.7 },
            systemPrompt: "",
            tools: [],
          },
        },
      })

      if (!res.ok) throw new Error("Failed to create agent")

      const data = await res.json()
      props.onClose()
      navigate(`/agents/${data.id}?startCopilot=true`)
    } catch (e) {
      console.error("Failed to create agent:", e)
      setError(e instanceof Error ? e.message : "Failed to create agent")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="2xl">
        <ModalHeader title={props.template?.name ?? "Preview"} onClose={props.onClose} />
        <ModalBody class="p-4">
          <Show when={props.template}>
            <div class="mb-4 flex items-center gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ "background-color": `${iconColor()}26`, color: iconColor() }}
              >
                <IconComponent />
              </div>
              <div>
                <p class="text-sm text-text">{props.template?.description}</p>
              </div>
            </div>

            <Show when={scenario()}>{(s) => <DemoPreview scenario={s()} class="min-h-[300px]" speed="normal" />}</Show>

            <Show when={props.template?.suggestedResources.length}>
              <div class="mt-4">
                <p class="mb-2 text-xs text-text-muted">Typically connects to</p>
                <div class="flex flex-wrap gap-2">
                  <For each={props.template?.suggestedResources}>
                    {(r) => (
                      <div class="flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-1">
                        <ResourceIcon type={r} class="h-4 w-4" />
                        <span class="text-xs text-text">{RESOURCE_LABELS[r] ?? r}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={error()}>
              <div class="mt-4 rounded-lg border border-danger bg-danger-soft px-4 py-2 text-sm text-danger">
                {error()}
              </div>
            </Show>
          </Show>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" size="sm" onClick={props.onClose} disabled={creating()}>
            Close
          </Button>
          <Button variant="default" size="sm" onClick={handleCreate} disabled={creating()}>
            {creating() ? (
              <>
                <Spinner size="xs" class="border-white border-t-transparent" />
                Creating...
              </>
            ) : (
              "Use this template"
            )}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
