import { For, Show, createSignal, type JSX } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { Plus, CaretDown, CaretRight, Broadcast, Timer, DotsThree, Cube } from "phosphor-solid-js"
import { DropdownMenu, type DropdownMenuItem } from "../../ui"
import { EntityIcon, AppIcon } from "../../components"
import type { Triggers } from "../../app/api"

type TriggerSidebarProps = {
  triggers: Triggers
  onCreateClick: () => void
  onDeleteClick?: (trigger: Triggers[number]) => void
}

type AgentInfo = NonNullable<Triggers[number]["agent"]>

function AgentGroup(props: {
  agent: AgentInfo
  triggers: Triggers
  currentId?: string
  onDeleteClick?: (trigger: Triggers[number]) => void
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
          <For each={props.triggers}>
            {(trigger) => {
              const isSelected = () => trigger.id === props.currentId
              const triggerIcon = (): JSX.Element => {
                if (trigger.type === "webhook") return <Broadcast class="h-3.5 w-3.5 shrink-0" />
                if (trigger.type === "schedule") return <Timer class="h-3.5 w-3.5 shrink-0" />
                if (trigger.appId) return <AppIcon appId={trigger.appId} class="h-3.5 w-3.5 shrink-0" />
                return <Cube class="h-3.5 w-3.5 shrink-0" />
              }
              const menuItems: DropdownMenuItem[] = [
                { type: "item", label: "Delete", variant: "danger", onClick: () => props.onDeleteClick?.(trigger) },
              ]
              return (
                <div
                  class="group/item flex items-center rounded transition-colors"
                  classList={{
                    "bg-surface-muted": isSelected(),
                    "hover:bg-surface-muted": !isSelected(),
                  }}
                >
                  <A
                    href={`/triggers/${trigger.id}`}
                    class="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-5 pr-1 text-xs font-medium"
                    classList={{
                      "text-text": isSelected(),
                      "text-text-secondary": !isSelected(),
                    }}
                  >
                    {triggerIcon()}
                    <span class="truncate">{trigger.name}</span>
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
          <Show when={props.triggers.length === 0}>
            <div class="py-1 pl-5 text-2xs text-text-muted">No triggers</div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function TriggerSidebar(props: TriggerSidebarProps) {
  const location = useLocation()
  const currentId = () => {
    const match = location.pathname.match(/^\/triggers\/(.+)$/)
    return match?.[1]
  }

  const triggersByAgent = () => {
    const grouped = new Map<string, Triggers[number][]>()
    for (const trigger of props.triggers) {
      const agentId = trigger.agentId
      if (!agentId) continue
      const existing = grouped.get(agentId) ?? []
      existing.push(trigger)
      grouped.set(agentId, existing)
    }
    return grouped
  }

  const agents = () => {
    const agentMap = new Map<string, AgentInfo>()
    for (const trigger of props.triggers) {
      if (!trigger.agentId || !trigger.agent) continue
      if (!agentMap.has(trigger.agentId)) {
        agentMap.set(trigger.agentId, trigger.agent)
      }
    }
    return Array.from(agentMap.values())
  }

  return (
    <div class="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div class="flex items-center justify-between px-3 pb-2 pt-3">
        <span class="text-xs font-medium text-text">Triggers</span>
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
                triggers={triggersByAgent().get(agent.id) ?? []}
                currentId={currentId()}
                onDeleteClick={props.onDeleteClick}
              />
            )}
          </For>
          <Show when={agents().length === 0}>
            <div class="p-2 text-center text-xs text-text-muted">No triggers yet</div>
          </Show>
        </div>
      </div>
    </div>
  )
}
