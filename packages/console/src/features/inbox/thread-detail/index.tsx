import { Show, For, createSignal, createMemo, createEffect, on } from "solid-js"
import { Badge, Markdown } from "../../../ui"
import { FastForward } from "phosphor-solid-js"
import { buildTimeline } from "./utils"
import { formatRelativeTime } from "../../../components"
import { AgentIcon, StatusBadge, UserMessage, AgentMessage, RejectedMessage } from "./message"
import { ReplyComposer } from "./reply-composer"
import { EmptyState, LoadingState } from "./states"
import { user } from "../../../app/session"
import type { Thread, ThreadMessage } from "../../../app/api"

type ThreadDetailProps = {
  thread: Thread | null
  loading?: boolean
  isChannelOwner?: boolean
  onHumanRequestRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  onReply?: (message: string) => void
  onAgentClick?: (agentId: string) => void
  onCreateRecipe?: (runId: string) => void
  responding?: boolean
  replying?: boolean
}

export function ThreadDetail(props: ThreadDetailProps) {
  const [replyMessage, setReplyMessage] = createSignal("")
  let scrollRef: HTMLDivElement | undefined

  const scrollToBottom = () => {
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight
  }

  const replyableStatuses = ["completed", "rejected", "failed"]
  const canReply = () => replyableStatuses.includes(props.thread?.status ?? "")

  const handleReply = () => {
    if (replyMessage().trim() && props.onReply) {
      props.onReply(replyMessage().trim())
      setReplyMessage("")
    }
  }

  const timeline = createMemo(() => {
    if (!props.thread) return []
    return buildTimeline({
      messages: props.thread.messages,
      humanRequests: props.thread.humanRequests,
      outputItems: props.thread.outputItems,
      humanResponses: props.thread.humanResponses,
      runs: props.thread.runs,
      threadStatus: props.thread.status,
    })
  })

  const isLastAgentInRun = (item: ReturnType<typeof timeline>[number], index: number): boolean => {
    if (item.type !== "agent") return true
    const runId = item.message?.runId ?? item.tools[0]?.call.runId ?? null
    if (!runId) return true
    const items = timeline()
    for (let i = index + 1; i < items.length; i++) {
      const next = items[i]
      if (next.type !== "agent") continue
      const nextRunId = next.message?.runId ?? next.tools[0]?.call.runId ?? null
      if (nextRunId === runId) return false
    }
    return true
  }

  createEffect(
    on(
      () => [props.thread?.id, props.thread?.messages.length],
      () => {
        requestAnimationFrame(scrollToBottom)
      },
    ),
  )

  return (
    <div class="flex flex-1 flex-col overflow-hidden bg-surface-elevated">
      <Show when={props.loading}>
        <LoadingState />
      </Show>
      <Show when={!props.loading && !props.thread}>
        <EmptyState />
      </Show>
      <Show when={!props.loading && props.thread} keyed>
        {(thread) => (
          <>
            <div class="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-2.5">
              <AgentIcon icon={thread.agent?.icon ?? null} iconColor={thread.agent?.iconColor ?? null} size={24} />
              <div class="flex flex-col min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-[13px] font-medium text-text">{thread.subject}</span>
                  <StatusBadge status={thread.status} />
                </div>
                <div class="flex items-center gap-1.5 text-2xs text-text-muted">
                  <button
                    type="button"
                    class="hover:text-text hover:underline transition-colors"
                    onClick={() => props.onAgentClick?.(thread.agentId)}
                  >
                    {thread.agent?.name ?? thread.agentId.slice(0, 8)}
                  </button>
                  <span>·</span>
                  <span>{formatRelativeTime(thread.createdAt)}</span>
                </div>
              </div>
            </div>

            <div ref={scrollRef} class="flex-1 overflow-y-auto scrollbar-thin">
              <div class="flex flex-col gap-4 px-4 py-4">
                <For each={timeline()}>
                  {(item, index) => (
                    <>
                      <Show when={item.type === "user"}>
                        <UserMessage message={(item as { type: "user"; message: ThreadMessage }).message} />
                      </Show>
                      <Show when={item.type === "agent" ? item : undefined}>
                        {(agentItem) => (
                          <AgentMessage
                            message={agentItem().message}
                            createdAt={agentItem().createdAt}
                            tools={agentItem().tools}
                            outputs={agentItem().outputs}
                            agent={thread.agent}
                            agentId={thread.agentId}
                            runs={thread.runs}
                            pendingHumanRequest={agentItem().pendingHumanRequest}
                            currentUserId={user()?.id}
                            threadCreatedBy={thread.createdBy}
                            isChannelOwner={props.isChannelOwner}
                            onHumanRequestRespond={props.onHumanRequestRespond}
                            onAgentClick={props.onAgentClick}
                            onCreateRecipe={props.onCreateRecipe}
                            isLastInRun={isLastAgentInRun(item, index())}
                            responding={props.responding}
                            status={agentItem().status}
                            delegatedTo={agentItem().delegatedTo}
                            subagentWorks={agentItem().subagentWorks}
                            summary={agentItem().summary}
                            humanRequests={agentItem().humanRequests}
                          />
                        )}
                      </Show>
                      <Show when={item.type === "rejection"}>
                        <RejectedMessage reason={(item as { type: "rejection"; reason: string | null }).reason} />
                      </Show>
                    </>
                  )}
                </For>

                <Show when={thread.status === "failed" && thread.error}>
                  <div class="flex gap-2.5">
                    <div class="w-6 shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="rounded-md bg-danger-soft/30 border border-danger/20 px-2.5 py-2">
                        <div class="flex items-center gap-1.5 mb-1">
                          <Badge variant="destructive" class="text-2xs">
                            Failed
                          </Badge>
                        </div>
                        <p class="text-xs text-text">{thread.error}</p>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={thread.status === "skipped"}>
                  <div class="flex gap-2.5">
                    <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                      <FastForward class="h-3.5 w-3.5 text-text-muted" weight="fill" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="rounded-lg border border-border bg-surface-muted/50 px-3 py-2.5">
                        <div class="flex items-center gap-1.5 mb-1.5">
                          <Badge variant="secondary" class="text-2xs">
                            Skipped
                          </Badge>
                        </div>
                        <Show
                          when={thread.skipReason}
                          fallback={
                            <p class="text-xs text-text-muted">This thread was skipped by the trigger script.</p>
                          }
                        >
                          <Markdown class="text-xs text-text-secondary">{thread.skipReason!}</Markdown>
                        </Show>
                      </div>
                    </div>
                  </div>
                </Show>
              </div>
            </div>

            <ReplyComposer
              agentName={thread.agent?.name ?? thread.agentId.slice(0, 8)}
              agentIcon={thread.agent?.icon ?? null}
              agentIconColor={thread.agent?.iconColor ?? null}
              value={replyMessage()}
              onInput={setReplyMessage}
              onSend={handleReply}
              sending={props.replying}
              disabled={!canReply()}
            />
          </>
        )}
      </Show>
    </div>
  )
}
