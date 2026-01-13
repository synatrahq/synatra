import { For, Show } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { House, Plus, SidebarSimple } from "phosphor-solid-js"
import { EntityIcon } from "../../components"
import { can } from "../../app"
import type { Agents } from "../../app/api"

type AgentsSidebarProps = {
  recents: Agents
  onCreateClick: () => void
  collapsed?: boolean
  onCollapse?: () => void
}

export function AgentsSidebar(props: AgentsSidebarProps) {
  const location = useLocation()
  const isHome = () => location.pathname === "/agents"

  return (
    <div class="flex h-full w-60 shrink-0 flex-col gap-2 border-r border-border bg-surface p-2">
      <div class="flex flex-col gap-0.5">
        <A
          href="/agents"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text transition-colors"
          classList={{
            "bg-surface-muted": isHome(),
            "hover:bg-surface-muted": !isHome(),
          }}
        >
          <House class="h-4 w-4 shrink-0" />
          <span>Home</span>
        </A>
        <Show when={can("agent", "create")}>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-muted"
            onClick={() => props.onCreateClick()}
          >
            <Plus class="h-4 w-4 shrink-0" />
            <span>New Agent</span>
          </button>
        </Show>
      </div>

      <Show when={props.recents.length > 0}>
        <div class="flex flex-col gap-1">
          <span class="px-2 text-2xs font-medium text-text-muted">Recents</span>
          <div class="flex flex-col gap-0.5">
            <For each={props.recents.slice(0, 5)}>
              {(agent) => {
                const isActive = () => location.pathname === `/agents/${agent.id}`
                return (
                  <A
                    href={`/agents/${agent.id}`}
                    class="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-text transition-colors"
                    classList={{
                      "bg-surface-muted": isActive(),
                      "hover:bg-surface-muted": !isActive(),
                    }}
                  >
                    <EntityIcon icon={agent.icon} iconColor={agent.iconColor} size={20} iconScale={0.7} />
                    <span class="truncate">{agent.name}</span>
                  </A>
                )
              }}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.onCollapse}>
        <button
          type="button"
          class="mt-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          onClick={() => props.onCollapse?.()}
        >
          <SidebarSimple class="h-4 w-4 shrink-0" />
          <span>Hide sidebar</span>
        </button>
      </Show>
    </div>
  )
}
