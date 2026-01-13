import { Show } from "solid-js"
import {
  Hash,
  Robot,
  UsersThree,
  Tray,
  Clock,
  CheckCircle,
  XCircle,
  Circle,
  Prohibit,
  Gear,
  CircleDashed,
  Archive,
  FastForward,
} from "phosphor-solid-js"
import { Button } from "../../ui"
import { EntityIcon } from "../../components"

type StatusFilter = "all" | "waiting_human" | "running" | "completed" | "failed" | "rejected" | "skipped" | "archive"

type ThreadListHeaderProps = {
  type: "status" | "agent" | "channel"
  statusFilter?: StatusFilter
  agentName?: string
  agentIcon?: string | null
  agentIconColor?: string | null
  channelName?: string
  memberCount?: number
  agentCount?: number
  isChannelOwner?: boolean
  onChannelClick?: () => void
}

function StatusIcon(props: { status: StatusFilter }) {
  const base = "h-4 w-4"
  switch (props.status) {
    case "all":
      return <Tray class={base} weight="duotone" />
    case "waiting_human":
      return <Clock class={base} weight="duotone" />
    case "completed":
      return <CheckCircle class={base} weight="duotone" />
    case "failed":
      return <XCircle class={base} weight="duotone" />
    case "rejected":
      return <Prohibit class={base} weight="duotone" />
    case "skipped":
      return <FastForward class={base} weight="duotone" />
    case "archive":
      return <Archive class={base} weight="duotone" />
    default:
      return <Circle class={base} weight="duotone" />
  }
}

function getStatusLabel(status: StatusFilter): string {
  switch (status) {
    case "all":
      return "All Threads"
    case "waiting_human":
      return "Waiting"
    case "running":
      return "Running"
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    case "rejected":
      return "Rejected"
    case "skipped":
      return "Skipped"
    case "archive":
      return "Archive"
    default:
      return status
  }
}

export function ThreadListHeader(props: ThreadListHeaderProps) {
  return (
    <div class="flex h-10 items-center justify-between px-3.5">
      <div class="flex items-center gap-2">
        <Show when={props.type === "status" && props.statusFilter}>
          <StatusIcon status={props.statusFilter!} />
          <span class="text-[13px] font-medium text-text">{getStatusLabel(props.statusFilter!)}</span>
        </Show>

        <Show when={props.type === "agent"}>
          <EntityIcon
            icon={props.agentIcon ?? null}
            iconColor={props.agentIconColor ?? null}
            size={18}
            fallback={Robot}
          />
          <span class="text-[13px] font-medium text-text">{props.agentName}</span>
        </Show>

        <Show when={props.type === "channel"}>
          <Hash class="h-4 w-4 text-text-muted" weight="bold" />
          <span class="text-[13px] font-medium text-text">{props.channelName}</span>
        </Show>
      </div>

      <Show when={props.type === "channel"}>
        <Button variant="ghost" size="sm" onClick={props.onChannelClick} class="gap-2 text-text-muted">
          <div class="flex items-center gap-1">
            <UsersThree class="h-3.5 w-3.5" />
            <span class="text-xs">{props.memberCount ?? 0}</span>
          </div>
          <div class="flex items-center gap-1">
            <CircleDashed class="h-3.5 w-3.5" weight="duotone" />
            <span class="text-xs">{props.agentCount ?? 0}</span>
          </div>
          <Show when={props.isChannelOwner}>
            <Gear class="h-3.5 w-3.5" />
          </Show>
        </Button>
      </Show>
    </div>
  )
}
