import { Show, For, createSignal, createMemo } from "solid-js"
import { Button, Spinner, Markdown, Badge } from "../../../../ui"
import {
  getIconComponent,
  AgentIcon,
  getAgentColor,
  ToolStatusIcon,
  statusText,
  formatRelativeTime,
} from "../../../../components"
import { Robot, CaretRight, CaretDown, Prohibit, ArrowBendDownRight } from "phosphor-solid-js"
import type { PlaygroundHumanRequest, PlaygroundOutputItem, PlaygroundHumanResponse } from "../../../../app/api"
import type { ToolPair, Agent, SubagentWork, PlaygroundRun } from "./types"
import type { SubagentInfo, AgentStatus } from "../../../../components"
import type { HumanRequestApprovalConfig } from "@synatra/core/types"
import { HumanRequestRenderer } from "../../../../components/human-request"
import { OutputItemRenderer } from "../../../../components/output-item"
import { CompletionSummary } from "./completion-summary"

export { AgentIcon } from "../../../../components"

function ToolCallItem(props: { pair: ToolPair; waitingApproval?: boolean }) {
  const [expanded, setExpanded] = createSignal(false)

  return (
    <div class="text-2xs">
      <button
        type="button"
        class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-muted/50 hover:bg-surface-muted transition-colors text-text-muted hover:text-text w-full"
        onClick={() => setExpanded(!expanded())}
      >
        <ToolStatusIcon status={props.pair.status} waitingApproval={props.waitingApproval} size="sm" />
        <span class="font-code text-left truncate">{props.pair.call.toolCall?.name}</span>
        <div class="flex-1" />
        {expanded() ? <CaretDown class="h-2.5 w-2.5 shrink-0" /> : <CaretRight class="h-2.5 w-2.5 shrink-0" />}
      </button>
      <Show when={expanded()}>
        <div class="mt-0.5 rounded bg-surface border border-border p-1.5">
          <div class="font-code text-2xs text-text-secondary overflow-x-auto">
            <p class="text-text-muted mb-0.5 font-sans text-2xs">Parameters</p>
            <pre class="whitespace-pre-wrap">{JSON.stringify(props.pair.call.toolCall?.params, null, 2)}</pre>
          </div>
          <Show when={props.pair.result?.toolResult}>
            {(result) => (
              <div class="mt-1 pt-1 border-t border-border">
                <Show
                  when={result().error}
                  fallback={
                    <div class="font-code text-2xs text-text-secondary overflow-x-auto max-h-20 overflow-y-auto">
                      <p class="text-text-muted mb-0.5 font-sans text-2xs">Result</p>
                      <pre class="whitespace-pre-wrap">{JSON.stringify(result().result, null, 2)}</pre>
                    </div>
                  }
                >
                  <p class="text-2xs text-danger">{result().error}</p>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

function DelegationIndicator(props: { subagent: SubagentInfo }) {
  const color = () => getAgentColor(props.subagent.iconColor)
  const IconComponent = props.subagent.icon ? getIconComponent(props.subagent.icon) : null

  return (
    <div class="flex items-center gap-1 py-0.5 text-2xs text-text-muted">
      <ArrowBendDownRight class="h-3 w-3 shrink-0" weight="bold" />
      <span>Delegated to</span>
      <span
        class="flex items-center gap-0.5 px-1 py-0.5 rounded-full"
        style={{ "background-color": `color-mix(in srgb, ${color()} 12%, transparent)` }}
      >
        <span
          class="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: "10px",
            height: "10px",
            "background-color": `color-mix(in srgb, ${color()} 20%, transparent)`,
          }}
        >
          {IconComponent ? (
            <IconComponent size={6} weight="duotone" style={{ color: color() }} />
          ) : (
            <Robot size={6} weight="duotone" style={{ color: color() }} />
          )}
        </span>
        <span style={{ color: color() }}>{props.subagent.name}</span>
      </span>
    </div>
  )
}

type SubagentSectionProps = {
  work: SubagentWork
  runs?: PlaygroundRun[]
  onHumanRequestRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  responding?: boolean
  showDelegationIndicator?: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  approving: boolean
  rejecting: boolean
}

function SubagentSection(props: SubagentSectionProps) {
  const [showAllTools, setShowAllTools] = createSignal(false)
  const hasMoreTools = () => props.work.tools.length > 3
  const isActive = () => !!props.work.status

  const color = () => getAgentColor(props.work.run.agent?.iconColor ?? null)
  const displayedTools = () => (showAllTools() ? props.work.tools : props.work.tools.slice(0, 3))

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
    const items: Array<{ hr: PlaygroundHumanRequest; response?: PlaygroundHumanResponse }> = []
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
      <IconComponent size={7} weight="duotone" style={{ color: color() }} />
    ) : (
      <Robot size={7} weight="duotone" style={{ color: color() }} />
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
        class="relative pl-3 border-l-2"
        style={{ "border-color": `color-mix(in srgb, ${color()} 30%, transparent)` }}
      >
        <div class="flex gap-1.5 py-0.5">
          <div class="relative flex h-3.5 items-center justify-center">
            <Show when={isActive()}>
              <span
                class="absolute h-3.5 w-3.5 animate-ping rounded opacity-30"
                style={{ "background-color": color() }}
              />
            </Show>
            <span
              class="relative flex shrink-0 items-center justify-center rounded"
              style={{
                width: "14px",
                height: "14px",
                "background-color": `color-mix(in srgb, ${color()} 15%, transparent)`,
              }}
            >
              {renderIcon()}
            </span>
          </div>

          <div class="flex-1 min-w-0 flex flex-col gap-1">
            <div class="flex h-3.5 items-center gap-1">
              <span class="text-2xs font-medium leading-none" style={{ color: color() }}>
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
              <div class="flex flex-col gap-0.5">
                <For each={displayedTools()}>
                  {(pair) => (
                    <ToolCallItem pair={pair} waitingApproval={isWaitingApproval() && pair.status === "running"} />
                  )}
                </For>
                <Show when={hasMoreTools() && !showAllTools()}>
                  <button
                    type="button"
                    class="text-2xs text-text-muted hover:text-text py-0.5 text-left"
                    onClick={() => setShowAllTools(true)}
                  >
                    +{props.work.tools.length - 3} more
                  </button>
                </Show>
              </div>
            </Show>

            <For each={sortedHumanRequests()}>
              {(item) => (
                <HumanRequestRenderer
                  request={item.hr}
                  response={item.response}
                  onRespond={props.onHumanRequestRespond}
                  responding={props.responding}
                />
              )}
            </For>

            <Show when={props.work.outputs.length > 0}>
              <div class="flex flex-col gap-1">
                <For each={props.work.outputs}>{(output) => <OutputItemRenderer item={output} compact />}</For>
              </div>
            </Show>

            <Show when={props.work.rejected}>
              <div class="rounded bg-surface-muted border border-border px-2 py-1.5">
                <div class="flex items-center gap-1 mb-0.5">
                  <Prohibit class="h-3 w-3 text-text-muted" weight="fill" />
                  <Badge variant="secondary" class="text-2xs">
                    Rejected
                  </Badge>
                </div>
                <p class="text-2xs text-text-muted">{props.work.rejectReason || "Action rejected by user"}</p>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}

type HumanRequestItem = {
  request: PlaygroundHumanRequest
  response?: PlaygroundHumanResponse
}

type AgentMessageProps = {
  message?: { content: string | null; createdAt: string }
  createdAt: string
  tools: ToolPair[]
  outputs: PlaygroundOutputItem[]
  pendingHumanRequest: PlaygroundHumanRequest | null
  agent?: Agent | null
  runs?: PlaygroundRun[]
  status?: AgentStatus
  delegatedTo?: SubagentInfo | null
  subagentWorks?: SubagentWork[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
  approving: boolean
  rejecting: boolean
  onHumanRequestRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  responding?: boolean
  summary?: string
  humanRequests?: HumanRequestItem[]
}

function getApprovalAction(hr: PlaygroundHumanRequest): { name: string; rationale?: string } | null {
  if (hr.kind !== "approval") return null
  const field = hr.config.fields[0] as HumanRequestApprovalConfig & { key: string }
  return field?.action ?? null
}

export function AgentMessage(props: AgentMessageProps) {
  const [showAllTools, setShowAllTools] = createSignal(false)
  const hasContent = () => props.message?.content && props.message.content.trim().length > 0
  const visibleTools = () => (showAllTools() ? props.tools : props.tools.slice(0, 5))
  const hasMoreTools = () => props.tools.length > 5
  const isActive = () => !!props.status
  const isDimmed = () => props.status?.type === "waiting_subagent"
  const isWaitingApproval = () => props.pendingHumanRequest?.kind === "approval"

  const color = () => getAgentColor(props.agent?.iconColor ?? null)

  const pendingTool = () => props.tools.find((t) => t.humanRequest?.id === props.pendingHumanRequest?.id)
  const pendingAction = () => (props.pendingHumanRequest ? getApprovalAction(props.pendingHumanRequest) : null)

  return (
    <div class="flex items-start gap-2">
      <div class="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <Show when={isActive() && !isDimmed()}>
          <span class="absolute h-5 w-5 animate-ping rounded-md opacity-30" style={{ "background-color": color() }} />
        </Show>
        <AgentIcon icon={props.agent?.icon ?? null} iconColor={props.agent?.iconColor ?? null} size={20} rounded="md" />
      </div>

      <div class="flex-1 min-w-0 flex flex-col gap-1">
        <div class="flex items-center gap-1">
          <span class="text-xs font-medium text-text" classList={{ "opacity-60": isDimmed() }}>
            {props.agent?.name ?? "Agent"}
          </span>
          <span class="text-2xs text-text-muted">{formatRelativeTime(props.createdAt)}</span>
          <Show when={props.status}>
            {(s) => (
              <>
                <span class="text-2xs text-text-muted">·</span>
                <span class="text-2xs text-text-muted animate-pulse">{statusText(s())}</span>
              </>
            )}
          </Show>
        </div>

        <Show when={props.tools.length > 0}>
          <div class="flex flex-col gap-0.5">
            <For each={visibleTools()}>
              {(pair) => (
                <ToolCallItem pair={pair} waitingApproval={isWaitingApproval() && pair.status === "running"} />
              )}
            </For>
            <Show when={hasMoreTools() && !showAllTools()}>
              <button
                type="button"
                class="text-2xs text-text-muted hover:text-text py-0.5 text-left"
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
              onHumanRequestRespond={props.onHumanRequestRespond}
              responding={props.responding}
              showDelegationIndicator
              onApprove={props.onApprove}
              onReject={props.onReject}
              approving={props.approving}
              rejecting={props.rejecting}
            />
          )}
        </For>

        <Show when={props.outputs.length > 0}>
          <div class="flex flex-col gap-1">
            <For each={props.outputs}>{(output) => <OutputItemRenderer item={output} compact />}</For>
          </div>
        </Show>

        <Show when={hasContent()}>
          <Markdown class="text-xs leading-relaxed text-text">{props.message!.content!}</Markdown>
        </Show>

        <Show when={props.pendingHumanRequest}>
          {(hr) => (
            <div class="mt-1 rounded border border-warning/50 bg-warning/5 p-1.5">
              <div class="flex flex-wrap items-center gap-1 mb-1">
                <Badge variant="warning" class="text-2xs">
                  Approval needed
                </Badge>
                <code class="font-code bg-surface px-1 py-0.5 rounded text-text text-2xs">
                  {pendingAction()?.name ?? pendingTool()?.call.toolCall?.name}
                </code>
              </div>
              <Show when={pendingAction()?.rationale}>
                <div class="mb-1 rounded bg-surface/80 px-1.5 py-1">
                  <Markdown class="text-2xs text-text">{pendingAction()!.rationale!}</Markdown>
                </div>
              </Show>
              <div class="flex items-center gap-1">
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => props.onApprove(hr().id)}
                  disabled={props.approving}
                  class="bg-success hover:bg-success-hover h-5 text-2xs px-2"
                >
                  {props.approving ? <Spinner size="xs" class="border-white border-t-transparent" /> : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => props.onReject(hr().id)}
                  disabled={props.rejecting}
                  class="h-5 text-2xs px-2"
                >
                  {props.rejecting ? <Spinner size="xs" /> : "Reject"}
                </Button>
              </div>
            </div>
          )}
        </Show>

        <For each={props.humanRequests}>
          {(item) => (
            <HumanRequestRenderer
              request={item.request}
              response={item.response}
              onRespond={props.onHumanRequestRespond}
              responding={props.responding}
            />
          )}
        </For>

        <Show when={props.summary}>
          <CompletionSummary summary={props.summary!} />
        </Show>
      </div>
    </div>
  )
}
