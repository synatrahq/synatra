import { For, Show, createSignal } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { Plus, CaretDown, CaretRight, Note, DotsThree } from "phosphor-solid-js"
import { DropdownMenu, type DropdownMenuItem } from "../../ui"
import { EntityIcon } from "../../components"
import type { Prompts } from "../../app/api"

type AgentInfo = NonNullable<Prompts[number]["agent"]>

type PromptSidebarProps = {
  prompts: Prompts
  onCreateClick: () => void
  onDeleteClick?: (prompt: Prompts[number]) => void
}

function AgentGroup(props: {
  agent: AgentInfo
  prompts: Prompts
  currentId?: string
  onDeleteClick?: (prompt: Prompts[number]) => void
}) {
  const [expanded, setExpanded] = createSignal(true)

  return (
    <div class="flex flex-col">
      <button
        type="button"
        class="group flex items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-surface-muted"
        onClick={() => setExpanded(!expanded())}
      >
        <span class="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <span class="group-hover:invisible">
            <EntityIcon icon={props.agent.icon} iconColor={props.agent.iconColor} size={16} iconScale={0.7} />
          </span>
          <span class="invisible absolute inset-0 flex items-center justify-center group-hover:visible">
            <Show when={expanded()} fallback={<CaretRight class="h-3.5 w-3.5 text-text-muted" />}>
              <CaretDown class="h-3.5 w-3.5 text-text-muted" />
            </Show>
          </span>
        </span>
        <span class="truncate text-xs font-medium text-text">{props.agent.name}</span>
      </button>
      <Show when={expanded()}>
        <div class="mt-0.5 flex flex-col gap-0.5">
          <For each={props.prompts}>
            {(prompt) => {
              const isActive = () => prompt.id === props.currentId
              const menuItems: DropdownMenuItem[] = [
                { type: "item", label: "Delete", variant: "danger", onClick: () => props.onDeleteClick?.(prompt) },
              ]
              return (
                <div
                  class="group/item flex items-center rounded transition-colors"
                  classList={{
                    "bg-surface-muted": isActive(),
                    "hover:bg-surface-muted": !isActive(),
                  }}
                >
                  <A
                    href={`/prompts/${prompt.id}`}
                    class="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-5 text-xs font-medium text-text"
                  >
                    <Note class="h-3.5 w-3.5 shrink-0" />
                    <span class="truncate">{prompt.name}</span>
                  </A>
                  <div class="hidden shrink-0 pr-1 group-hover/item:block">
                    <DropdownMenu
                      items={menuItems}
                      trigger={
                        <span class="text-text-muted hover:text-text">
                          <DotsThree class="h-3.5 w-3.5" weight="bold" />
                        </span>
                      }
                    />
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}

export function PromptSidebar(props: PromptSidebarProps) {
  const location = useLocation()
  const currentId = () => {
    const match = location.pathname.match(/^\/prompts\/(.+)$/)
    return match?.[1]
  }

  const promptsByAgent = () => {
    const grouped = new Map<string, Prompts[number][]>()
    for (const prompt of props.prompts) {
      const existing = grouped.get(prompt.agentId) ?? []
      existing.push(prompt)
      grouped.set(prompt.agentId, existing)
    }
    return grouped
  }

  const agents = () => {
    const agentMap = new Map<string, AgentInfo>()
    for (const prompt of props.prompts) {
      if (!agentMap.has(prompt.agentId) && prompt.agent) {
        agentMap.set(prompt.agentId, prompt.agent)
      }
    }
    return Array.from(agentMap.values())
  }

  return (
    <div class="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div class="flex items-center justify-between px-3 pb-2 pt-3">
        <span class="text-xs font-medium text-text">Prompts</span>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          onClick={() => props.onCreateClick()}
        >
          <Plus class="h-3.5 w-3.5" />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-1.5 pb-1.5 pt-0.5 scrollbar-thin">
        <div class="flex flex-col gap-0.5">
          <For each={agents()}>
            {(agent) => (
              <AgentGroup
                agent={agent}
                prompts={promptsByAgent().get(agent.id) ?? []}
                currentId={currentId()}
                onDeleteClick={props.onDeleteClick}
              />
            )}
          </For>
          <Show when={agents().length === 0}>
            <div class="p-2 text-center text-xs text-text-muted">No prompts yet</div>
          </Show>
        </div>
      </div>
    </div>
  )
}
