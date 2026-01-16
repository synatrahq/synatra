import { For, Show } from "solid-js"
import {
  Tray,
  Clock,
  CheckCircle,
  XCircle,
  Circle,
  CaretRight,
  Prohibit,
  Robot,
  Plus,
  Hash,
  Archive,
  FastForward,
} from "phosphor-solid-js"
import { Button } from "../../ui"
import { EntityIcon } from "../../components"

type ThreadStatus = "all" | "running" | "waiting_human" | "completed" | "failed" | "rejected" | "skipped" | "archive"

type StatusItem = {
  value: ThreadStatus
  label: string
  icon: typeof Tray
  count?: number
}

type AgentItem = {
  id: string
  name: string
  slug: string | null
  icon: string | null
  iconColor: string | null
  count: number
}

type ChannelItem = {
  id: string
  name: string
  slug: string
  icon: string | null
  iconColor: string | null
  isDefault: boolean
  count: number
}

type InboxSidebarProps = {
  statusFilter: ThreadStatus
  agentFilter: string | null
  channelFilter: string | null
  onStatusChange: (status: ThreadStatus) => void
  onAgentChange: (agentId: string | null) => void
  onChannelChange: (channelId: string | null) => void
  statusCounts: Record<string, number>
  archivedCount: number
  agents: AgentItem[]
  channels: ChannelItem[]
  agentsExpanded: boolean
  channelsExpanded: boolean
  onAgentsExpandedChange: (expanded: boolean) => void
  onChannelsExpandedChange: (expanded: boolean) => void
  onNewThread: () => void
  onNewChannel: () => void
}

function StatusIcon(props: { status: ThreadStatus; class?: string }) {
  const baseClass = () => props.class ?? "h-4 w-4"
  switch (props.status) {
    case "all":
      return <Tray class={baseClass()} />
    case "waiting_human":
      return <Clock class={baseClass()} />
    case "completed":
      return <CheckCircle class={baseClass()} weight="fill" />
    case "failed":
      return <XCircle class={baseClass()} weight="fill" />
    case "rejected":
      return <Prohibit class={baseClass()} weight="fill" />
    case "skipped":
      return <FastForward class={baseClass()} weight="fill" />
    case "archive":
      return <Archive class={baseClass()} />
    default:
      return <Circle class={baseClass()} weight="fill" />
  }
}

function ChannelIcon(props: { size?: number }) {
  const size = () => props.size ?? 16
  return <Hash size={size()} weight="bold" class="text-text-muted" />
}

export function InboxSidebar(props: InboxSidebarProps) {
  const statusItems: StatusItem[] = [
    { value: "all", label: "All", icon: Tray },
    { value: "waiting_human", label: "Waiting", icon: Clock },
    { value: "running", label: "Running", icon: Circle },
    { value: "completed", label: "Completed", icon: CheckCircle },
    { value: "failed", label: "Failed", icon: XCircle },
    { value: "rejected", label: "Rejected", icon: Prohibit },
    { value: "skipped", label: "Skipped", icon: FastForward },
    { value: "archive", label: "Archive", icon: Archive },
  ]

  const totalCount = () => {
    return Object.values(props.statusCounts).reduce((a, b) => a + b, 0)
  }

  const getStatusCount = (status: ThreadStatus) => {
    if (status === "all") return totalCount()
    if (status === "archive") return props.archivedCount
    return props.statusCounts[status] ?? 0
  }

  return (
    <div class="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <h1 class="text-[13px] font-medium leading-5 text-text">Inbox</h1>
        <Button variant="default" size="sm" onClick={props.onNewThread}>
          <Plus class="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      <div class="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        <div class="flex flex-col gap-0.5">
          <For each={statusItems}>
            {(item) => {
              const isActive = () => props.statusFilter === item.value && !props.agentFilter && !props.channelFilter
              const count = () => getStatusCount(item.value)
              return (
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text transition-colors"
                  classList={{
                    "bg-surface-muted": isActive(),
                    "hover:bg-surface-muted": !isActive(),
                  }}
                  onClick={() => {
                    props.onStatusChange(item.value)
                    props.onAgentChange(null)
                  }}
                >
                  <div class="flex items-center gap-2">
                    <StatusIcon status={item.value} class="h-4 w-4 text-text-muted" />
                    <span>{item.label}</span>
                  </div>
                  <Show when={count() > 0}>
                    <span class="text-2xs text-text-muted">{count()}</span>
                  </Show>
                </button>
              )
            }}
          </For>
        </div>

        <div class="mt-2 flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 text-2xs font-medium text-text-muted hover:text-text"
              onClick={() => props.onChannelsExpandedChange(!props.channelsExpanded)}
            >
              <span class="h-3 w-3 transition-transform" classList={{ "rotate-90": props.channelsExpanded }}>
                <CaretRight class="h-3 w-3" />
              </span>
              <span>Channels</span>
            </button>
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              onClick={(e) => {
                e.stopPropagation()
                props.onNewChannel()
              }}
            >
              <Plus class="h-3 w-3" />
            </button>
          </div>
          <Show when={props.channelsExpanded}>
            <div class="flex flex-col gap-0.5">
              <For each={props.channels}>
                {(channel) => {
                  const isActive = () => props.channelFilter === channel.id
                  return (
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs font-medium text-text transition-colors"
                      classList={{
                        "bg-surface-muted": isActive(),
                        "hover:bg-surface-muted": !isActive(),
                      }}
                      onClick={() => {
                        props.onChannelChange(channel.id)
                      }}
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <ChannelIcon size={14} />
                        <span class="truncate">{channel.name}</span>
                      </div>
                      <Show when={channel.count > 0}>
                        <span class="text-2xs text-text-muted">{channel.count}</span>
                      </Show>
                    </button>
                  )
                }}
              </For>
              <Show when={props.channels.length === 0}>
                <div class="px-2 py-1 text-2xs text-text-muted">No channels yet</div>
              </Show>
            </div>
          </Show>
        </div>

        <Show when={props.agents.length > 0}>
          <div class="mt-2 flex flex-col gap-1">
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 text-2xs font-medium text-text-muted hover:text-text"
              onClick={() => props.onAgentsExpandedChange(!props.agentsExpanded)}
            >
              <span class="h-3 w-3 transition-transform" classList={{ "rotate-90": props.agentsExpanded }}>
                <CaretRight class="h-3 w-3" />
              </span>
              <span>Agents</span>
            </button>
            <Show when={props.agentsExpanded}>
              <div class="flex flex-col gap-0.5">
                <For each={props.agents}>
                  {(agent) => {
                    const isActive = () => props.agentFilter === agent.id
                    return (
                      <button
                        type="button"
                        class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs font-medium text-text transition-colors"
                        classList={{
                          "bg-surface-muted": isActive(),
                          "hover:bg-surface-muted": !isActive(),
                        }}
                        onClick={() => {
                          props.onAgentChange(agent.id)
                        }}
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <EntityIcon
                            icon={agent.icon}
                            iconColor={agent.iconColor}
                            size={16}
                            iconScale={0.7}
                            fallback={Robot}
                          />
                          <span class="truncate">{agent.name}</span>
                        </div>
                        <Show when={agent.count > 0}>
                          <span class="text-2xs text-text-muted">{agent.count}</span>
                        </Show>
                      </button>
                    )
                  }}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
