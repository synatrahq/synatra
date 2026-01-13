import { Show, For } from "solid-js"
import { Brain, Wrench } from "phosphor-solid-js"
import type { AgentRuntimeConfig, ModelProvider } from "@synatra/core/types"
import type { Selection } from "./constants"

type WorkflowPanelProps = {
  config: AgentRuntimeConfig | null
  activeSelection?: Selection | null
}

function getProviderLabel(provider: ModelProvider) {
  switch (provider) {
    case "anthropic":
      return "Anthropic"
    case "google":
      return "Google"
    case "openai":
      return "OpenAI"
    default:
      return provider
  }
}

function getProviderColor(provider: ModelProvider) {
  switch (provider) {
    case "anthropic":
      return "text-warning"
    case "google":
      return "text-success"
    default:
      return "text-accent"
  }
}

function NodeContainer(props: { children: any; highlight?: boolean }) {
  return (
    <div
      class="rounded-lg border bg-surface-elevated p-3"
      classList={{
        "border-border": !props.highlight,
        "border-accent": props.highlight,
      }}
    >
      {props.children}
    </div>
  )
}

function NodeHeader(props: { icon: any; label: string; sublabel?: string; color?: string }) {
  const Icon = props.icon
  return (
    <div class="flex items-center gap-2">
      <div class="flex h-6 w-6 items-center justify-center rounded bg-surface-muted">
        <Icon class={`h-3.5 w-3.5 ${props.color ?? "text-text-muted"}`} weight="duotone" />
      </div>
      <div class="flex flex-col">
        <span class="text-xs font-medium text-text">{props.label}</span>
        <Show when={props.sublabel}>
          <span class="text-2xs text-text-muted">{props.sublabel}</span>
        </Show>
      </div>
    </div>
  )
}

function AgentNode(props: { config: AgentRuntimeConfig; highlight?: boolean; highlightedToolIndex?: number }) {
  const model = () => props.config.model
  const tools = () => props.config.tools ?? []

  return (
    <NodeContainer highlight={props.highlight}>
      <NodeHeader
        icon={Brain}
        label={model().model}
        sublabel={getProviderLabel(model().provider)}
        color={getProviderColor(model().provider)}
      />
      <div class="mt-2 space-y-2">
        <Show when={props.config.systemPrompt}>
          <div class="rounded bg-surface px-2 py-1.5">
            <span class="text-2xs font-medium text-text-muted">Instructions</span>
            <p class="mt-0.5 line-clamp-2 font-code text-2xs text-text">{props.config.systemPrompt}</p>
          </div>
        </Show>

        <div class="border-t border-accent/30 pt-2">
          <div class="mb-1.5 flex items-center gap-1.5">
            <Wrench class="h-3 w-3 text-success" weight="duotone" />
            <span class="text-2xs font-medium text-text-muted">Tools ({tools().length})</span>
          </div>
          <Show
            when={tools().length > 0}
            fallback={<div class="text-2xs italic text-text-muted">No tools configured</div>}
          >
            <div class="space-y-1">
              <For each={tools()}>
                {(tool, index) => {
                  const isHighlighted = () => props.highlightedToolIndex === index()
                  return (
                    <div
                      class="flex items-center justify-between rounded border px-2 py-1"
                      classList={{
                        "bg-surface border-transparent": !isHighlighted(),
                        "bg-accent-soft border-accent": isHighlighted(),
                      }}
                    >
                      <span class="text-2xs font-medium text-text">{tool.name}</span>
                      <Show when={tool.requiresReview}>
                        <span class="rounded bg-warning-soft px-1 py-0.5 text-[9px] font-medium text-warning">
                          review
                        </span>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </NodeContainer>
  )
}

export function WorkflowPanel(props: WorkflowPanelProps) {
  const isAgentHighlighted = () => {
    const sel = props.activeSelection
    if (!sel) return false
    return sel.type === "model" || sel.type === "prompt"
  }

  const highlightedToolIndex = () => {
    const sel = props.activeSelection
    if (!sel || sel.type !== "tool") return undefined
    return sel.index
  }

  return (
    <Show
      when={props.config}
      fallback={
        <div class="flex h-full items-center justify-center text-sm text-text-muted">No configuration available</div>
      }
    >
      {(config) => (
        <div class="flex h-full flex-col overflow-y-auto p-3 scrollbar-thin">
          <div class="mx-auto w-full">
            <AgentNode
              config={config()}
              highlight={isAgentHighlighted()}
              highlightedToolIndex={highlightedToolIndex()}
            />
          </div>
        </div>
      )}
    </Show>
  )
}
