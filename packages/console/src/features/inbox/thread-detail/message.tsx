import { Show, For, createSignal, createMemo } from "solid-js"
import { Badge, Markdown } from "../../../ui"
import {
  getIconComponent,
  ICON_COLORS,
  AgentIcon,
  getAgentColor,
  ToolStatusIcon,
  statusText,
  formatRelativeTime,
} from "../../../components"
import { Robot, CaretDown, CaretRight, Prohibit, ArrowBendDownRight } from "phosphor-solid-js"
import { user } from "../../../app/session"
import { HumanRequestRenderer } from "../../../components/human-request"
import { OutputItemRenderer } from "../../../components/output-item"
import { WorkingIndicator } from "./working-indicator"
import { getInitials } from "./utils"
import type { ThreadStatus } from "@synatra/core/types"
import type {
  ThreadMessage,
  ThreadAgent,
  ThreadRun,
  ThreadHumanRequest,
  ThreadHumanResponse,
  ThreadOutputItem,
} from "../../../app/api"
import type { ToolPair, SubagentWork } from "./types"
import type { SubagentInfo, AgentStatus } from "../../../components"

export { AgentIcon } from "../../../components"

export function StatusBadge(props: { status: ThreadStatus }) {
  const variant = () => {
    switch (props.status) {
      case "waiting_human":
        return "warning" as const
      case "running":
        return "default" as const
      case "completed":
        return "success" as const
      case "failed":
        return "destructive" as const
      case "rejected":
      case "skipped":
        return "secondary" as const
      default:
        return "secondary" as const
    }
  }

  const label = () => {
    switch (props.status) {
      case "waiting_human":
        return "Waiting"
      case "running":
        return "Running"
      case "completed":
        return "Completed"
      case "failed":
        return "Failed"
      case "cancelled":
        return "Cancelled"
      case "rejected":
        return "Rejected"
      case "skipped":
        return "Skipped"
      default:
        return props.status
    }
  }

  return (
    <Badge variant={variant()} class="text-2xs">
      {label()}
    </Badge>
  )
}

export function UserMessage(props: { message: ThreadMessage }) {
  const initials = createMemo(() => getInitials(user()?.name, user()?.email))

  return (
    <div class="flex gap-2.5">
      <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent text-2xs font-medium">
        {initials()}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="text-[13px] font-medium text-text">You</span>
          <span class="text-2xs text-text-muted">{formatRelativeTime(props.message.createdAt)}</span>
        </div>
        <p class="text-[13px] leading-relaxed text-text whitespace-pre-wrap">{props.message.content}</p>
      </div>
    </div>
  )
}

export function RejectedMessage(props: { reason: string | null }) {
  const initials = createMemo(() => getInitials(user()?.name, user()?.email))

  return (
    <div class="flex gap-2.5">
      <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent text-2xs font-medium">
        {initials()}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="text-[13px] font-medium text-text">You</span>
          <Badge variant="secondary" class="text-2xs">
            Rejected
          </Badge>
        </div>
        <p class="text-[13px] leading-relaxed text-text-muted">{props.reason || "Rejected this action"}</p>
      </div>
    </div>
  )
}

function ToolCallItem(props: { pair: ToolPair; waitingApproval?: boolean }) {
  const [expanded, setExpanded] = createSignal(false)

  return (
    <div class="text-xs">
      <button
        type="button"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-muted/50 hover:bg-surface-muted transition-colors text-text-muted hover:text-text w-full"
        onClick={() => setExpanded(!expanded())}
      >
        <ToolStatusIcon status={props.pair.status} waitingApproval={props.waitingApproval} size="md" />
        <span class="font-code text-left truncate">{props.pair.call.toolCall?.name}</span>
        <div class="flex-1" />
        {expanded() ? <CaretDown class="h-3 w-3 shrink-0" /> : <CaretRight class="h-3 w-3 shrink-0" />}
      </button>

      <Show when={expanded()}>
        <div class="mt-1 rounded-lg bg-surface border border-border p-3">
          <div class="font-code text-xs text-text-secondary overflow-x-auto">
            <p class="text-text-muted mb-1 font-sans text-2xs">Parameters</p>
            <pre class="whitespace-pre-wrap">{JSON.stringify(props.pair.call.toolCall?.params, null, 2)}</pre>
          </div>
          <Show when={props.pair.result?.toolResult}>
            {(result) => (
              <div class="mt-2 pt-2 border-t border-border">
                <Show
                  when={result().error}
                  fallback={
                    <Show
                      when={(result().result as Record<string, unknown> | null)?.approved === false}
                      fallback={
                        <div class="font-code text-xs text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">
                          <p class="text-text-muted mb-1 font-sans text-2xs">Result</p>
                          <pre class="whitespace-pre-wrap">{JSON.stringify(result().result, null, 2)}</pre>
                        </div>
                      }
                    >
                      <p class="text-xs text-text-muted">
                        {String((result().result as Record<string, unknown> | null)?.reason ?? "Rejected")}
                      </p>
                    </Show>
                  }
                >
                  <p class="text-xs text-danger">{result().error}</p>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function CompletedSummary(props: { summary: string }) {
  return (
    <div class="rounded-lg border border-success/50 bg-success/5 p-3">
      <div class="flex items-center gap-1.5 mb-1">
        <Badge variant="success" class="text-2xs">
          Completed
        </Badge>
      </div>
      <Markdown class="text-xs text-text">{props.summary}</Markdown>
    </div>
  )
}

function DelegationIndicator(props: { subagent: SubagentInfo }) {
  const color = () => getAgentColor(props.subagent.iconColor)
  const IconComponent = props.subagent.icon ? getIconComponent(props.subagent.icon) : null

  return (
    <div class="flex items-center gap-1.5 py-1 text-xs text-text-muted">
      <ArrowBendDownRight class="h-3.5 w-3.5 shrink-0" weight="bold" />
      <span>Delegated to</span>
      <span
        class="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
        style={{ "background-color": `color-mix(in srgb, ${color()} 12%, transparent)` }}
      >
        <span
          class="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: "12px",
            height: "12px",
            "background-color": `color-mix(in srgb, ${color()} 20%, transparent)`,
          }}
        >
          {IconComponent ? (
            <IconComponent size={7} weight="duotone" style={{ color: color() }} />
          ) : (
            <Robot size={7} weight="duotone" style={{ color: color() }} />
          )}
        </span>
        <span style={{ color: color() }}>{props.subagent.name}</span>
      </span>
    </div>
  )
}

type SubagentSectionProps = {
  work: SubagentWork
  runs?: ThreadRun[]
  currentUserId?: string | null
  threadCreatedBy?: string | null
  isChannelOwner?: boolean
  onHumanRequestRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  responding?: boolean
  showDelegationIndicator?: boolean
}

function SubagentSection(props: SubagentSectionProps) {
  const [showAllTools, setShowAllTools] = createSignal(false)
  const hasMoreTools = () => props.work.tools.length > 5
  const isActive = () => !!props.work.status

  const color = () => getAgentColor(props.work.run.agent?.iconColor ?? null)
  const displayedTools = () => (showAllTools() ? props.work.tools : props.work.tools.slice(0, 5))

  const pendingApproval = createMemo(() => {
    for (const tool of props.work.tools) {
      if (tool.humanRequest?.status === "pending" && tool.humanRequest.kind === "approval") {
        return tool.humanRequest
      }
    }
    return null
  })

  const isWaitingApproval = () => !!pendingApproval()

  const sortedHumanRequests = createMemo(() => {
    const items: Array<{ hr: ThreadHumanRequest; response?: ThreadHumanResponse }> = []
    const approval = pendingApproval()
    if (approval) {
      items.push({ hr: approval })
    }
    for (const item of props.work.humanRequests) {
      items.push({ hr: item.request, response: item.response })
    }
    return items.sort((a, b) => new Date(a.hr.createdAt).getTime() - new Date(b.hr.createdAt).getTime())
  })

  const renderIcon = () => {
    const IconComponent = props.work.run.agent?.icon ? getIconComponent(props.work.run.agent.icon) : null
    return IconComponent ? (
      <IconComponent size={9} weight="duotone" style={{ color: color() }} />
    ) : (
      <Robot size={9} weight="duotone" style={{ color: color() }} />
    )
  }

  const subagentInfo = (): SubagentInfo | null => {
    if (!props.work.run.agent) return null
    return {
      name: props.work.run.agent.name,
      icon: props.work.run.agent.icon,
      iconColor: props.work.run.agent.iconColor,
    }
  }

  return (
    <div>
      <Show when={props.showDelegationIndicator && subagentInfo()}>
        {(info) => <DelegationIndicator subagent={info()} />}
      </Show>
      <div
        class="relative pl-4 border-l-2"
        style={{ "border-color": `color-mix(in srgb, ${color()} 30%, transparent)` }}
      >
        <div class="flex gap-2 py-1">
          <div class="relative flex h-4 items-center justify-center">
            <Show when={isActive()}>
              <span class="absolute h-4 w-4 animate-ping rounded opacity-30" style={{ "background-color": color() }} />
            </Show>
            <span
              class="relative flex shrink-0 items-center justify-center rounded"
              style={{
                width: "16px",
                height: "16px",
                "background-color": `color-mix(in srgb, ${color()} 15%, transparent)`,
              }}
            >
              {renderIcon()}
            </span>
          </div>

          <div class="flex-1 min-w-0 flex flex-col gap-1.5">
            <div class="flex h-4 items-center gap-1.5">
              <span class="text-xs font-medium leading-none" style={{ color: color() }}>
                {props.work.run.agent?.name ?? "Subagent"}
              </span>
              <Show when={props.work.status}>
                {(s) => (
                  <>
                    <span class="text-text-muted">·</span>
                    <span class="text-2xs text-text-muted animate-pulse leading-none">{statusText(s())}</span>
                  </>
                )}
              </Show>
            </div>

            <Show when={props.work.tools.length > 0}>
              <div class="flex flex-col gap-1">
                <For each={displayedTools()}>
                  {(pair) => (
                    <ToolCallItem pair={pair} waitingApproval={isWaitingApproval() && pair.status === "running"} />
                  )}
                </For>
                <Show when={hasMoreTools() && !showAllTools()}>
                  <button
                    type="button"
                    class="text-2xs text-text-muted hover:text-text py-1 text-left"
                    onClick={() => setShowAllTools(true)}
                  >
                    +{props.work.tools.length - 5} more
                  </button>
                </Show>
              </div>
            </Show>

            <For each={sortedHumanRequests()}>
              {(item) => (
                <HumanRequestRenderer
                  request={item.hr}
                  response={item.response}
                  runs={props.runs}
                  currentUserId={props.currentUserId}
                  threadCreatedBy={props.threadCreatedBy}
                  isChannelOwner={props.isChannelOwner}
                  onRespond={props.onHumanRequestRespond}
                  responding={props.responding}
                />
              )}
            </For>

            <Show when={props.work.outputs.length > 0}>
              <div class="flex flex-col gap-2">
                <For each={props.work.outputs}>{(output) => <OutputItemRenderer item={output} />}</For>
              </div>
            </Show>

            <Show when={props.work.rejected}>
              <div class="rounded-md bg-surface-muted border border-border px-2.5 py-2">
                <div class="flex items-center gap-1.5 mb-1">
                  <Prohibit class="h-3.5 w-3.5 text-text-muted" weight="fill" />
                  <Badge variant="secondary" class="text-2xs">
                    Rejected
                  </Badge>
                </div>
                <p class="text-xs text-text-muted">{props.work.rejectReason || "Action rejected by user"}</p>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}

type HumanRequestItem = {
  request: ThreadHumanRequest
  response?: ThreadHumanResponse
}

type AgentMessageProps = {
  message?: ThreadMessage
  createdAt: string
  tools: ToolPair[]
  outputs: ThreadOutputItem[]
  agent?: ThreadAgent | null
  agentId?: string
  runs?: ThreadRun[]
  pendingHumanRequest?: ThreadHumanRequest | null
  currentUserId?: string | null
  threadCreatedBy?: string | null
  isChannelOwner?: boolean
  onHumanRequestRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  onAgentClick?: (agentId: string) => void
  responding?: boolean
  status?: AgentStatus
  delegatedTo?: SubagentInfo | null
  subagentWorks?: SubagentWork[]
  summary?: string
  humanRequests?: HumanRequestItem[]
}

export function AgentMessage(props: AgentMessageProps) {
  const [showAllTools, setShowAllTools] = createSignal(false)
  const hasContent = () => props.message?.content && props.message.content.trim().length > 0
  const isWaitingApproval = () => props.pendingHumanRequest?.kind === "approval"
  const hasMoreTools = () => props.tools.length > 5
  const isActive = () => !!props.status
  const isDimmed = () => props.status?.type === "waiting_subagent"

  const color = () => getAgentColor(props.agent?.iconColor ?? null)
  const displayedTools = () => (showAllTools() ? props.tools : props.tools.slice(0, 5))

  return (
    <div class="flex items-start gap-2.5">
      <div class="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <Show when={isActive() && !isDimmed()}>
          <span class="absolute h-6 w-6 animate-ping rounded-md opacity-30" style={{ "background-color": color() }} />
        </Show>
        <AgentIcon icon={props.agent?.icon ?? null} iconColor={props.agent?.iconColor ?? null} size={24} rounded="md" />
      </div>

      <div class="flex-1 min-w-0 flex flex-col gap-1.5">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="text-[13px] font-medium text-text hover:underline transition-colors"
            classList={{ "opacity-60": isDimmed() }}
            onClick={() => props.agentId && props.onAgentClick?.(props.agentId)}
          >
            {props.agent?.name ?? "Agent"}
          </button>
          <span class="text-2xs text-text-muted">{formatRelativeTime(props.createdAt)}</span>
        </div>

        <Show when={props.tools.length > 0}>
          <div class="flex flex-col gap-1">
            <For each={displayedTools()}>
              {(pair) => (
                <ToolCallItem pair={pair} waitingApproval={isWaitingApproval() && pair.status === "running"} />
              )}
            </For>
            <Show when={hasMoreTools() && !showAllTools()}>
              <button
                type="button"
                class="text-2xs text-text-muted hover:text-text py-1 text-left"
                onClick={() => setShowAllTools(true)}
              >
                +{props.tools.length - 5} more
              </button>
            </Show>
          </div>
        </Show>

        <For each={props.subagentWorks}>
          {(work) => (
            <SubagentSection
              work={work}
              runs={props.runs}
              currentUserId={props.currentUserId}
              threadCreatedBy={props.threadCreatedBy}
              isChannelOwner={props.isChannelOwner}
              onHumanRequestRespond={props.onHumanRequestRespond}
              responding={props.responding}
              showDelegationIndicator
            />
          )}
        </For>

        <Show when={props.outputs.length > 0}>
          <div class="flex flex-col gap-2">
            <For each={props.outputs}>{(output) => <OutputItemRenderer item={output} />}</For>
          </div>
        </Show>

        <Show when={hasContent()}>
          <Markdown class="text-[13px] leading-relaxed text-text">{props.message!.content!}</Markdown>
        </Show>

        <Show when={props.pendingHumanRequest}>
          {(hr) => (
            <HumanRequestRenderer
              request={hr()}
              agent={props.agent}
              runs={props.runs}
              currentUserId={props.currentUserId}
              threadCreatedBy={props.threadCreatedBy}
              isChannelOwner={props.isChannelOwner}
              onRespond={props.onHumanRequestRespond}
              responding={props.responding}
            />
          )}
        </Show>

        <For each={props.humanRequests}>
          {(item) => (
            <HumanRequestRenderer
              request={item.request}
              response={item.response}
              agent={props.agent}
              runs={props.runs}
              currentUserId={props.currentUserId}
              threadCreatedBy={props.threadCreatedBy}
              isChannelOwner={props.isChannelOwner}
              onRespond={props.onHumanRequestRespond}
              responding={props.responding}
            />
          )}
        </For>

        <Show when={props.summary}>
          <CompletedSummary summary={props.summary!} />
        </Show>

        <Show when={isActive()}>
          <WorkingIndicator status={props.status!} />
        </Show>
      </div>
    </div>
  )
}
