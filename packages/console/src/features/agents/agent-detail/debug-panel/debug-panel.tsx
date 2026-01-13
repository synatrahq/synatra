import { Show, For, createSignal, createEffect, on, onCleanup, onMount, createMemo } from "solid-js"
import { Button, Spinner, Textarea, Badge } from "../../../../ui"
import { ArrowUp, Bug, Trash, ChatCircle, Wrench } from "phosphor-solid-js"
import { api, apiBaseURL } from "../../../../app"
import type {
  PlaygroundSessionData,
  PlaygroundStatus,
  PlaygroundMessage,
  PlaygroundOutputItem,
  PlaygroundHumanRequest,
  PlaygroundHumanResponse,
} from "../../../../app/api"
import type { DebugPanelProps, DebugPanelTab, PlaygroundRun } from "./types"
import { buildTimeline, deriveLastSeq, upsertMessage, upsertRun } from "./timeline"
import { AgentIcon, AgentMessage } from "./agent-message"
import { UserMessage, RejectedMessage } from "./user-message"
import { ToolTester } from "./tool-tester"

export function DebugPanel(props: DebugPanelProps) {
  const [activeTab, setActiveTab] = createSignal<DebugPanelTab>("chat")
  const [session, setSession] = createSignal<PlaygroundSessionData | null>(null)
  const [messages, setMessages] = createSignal<PlaygroundMessage[]>([])
  const [humanRequests, setHumanRequests] = createSignal<PlaygroundHumanRequest[]>([])
  const [humanResponses, setHumanResponses] = createSignal<PlaygroundHumanResponse[]>([])
  const [outputItems, setOutputItems] = createSignal<PlaygroundOutputItem[]>([])
  const [runs, setRuns] = createSignal<PlaygroundRun[]>([])
  const [input, setInput] = createSignal("")
  const [responding, setResponding] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [historyLoading, setHistoryLoading] = createSignal(false)
  const [approving, setApproving] = createSignal(false)
  const [rejecting, setRejecting] = createSignal(false)
  const [lastSeq, setLastSeq] = createSignal<number | null>(null)
  let scrollRef: HTMLDivElement | undefined
  let eventSource: EventSource | null = null
  let connectedSessionId: string | null = null
  let retryTimer: number | null = null
  let pollingTimer: number | null = null
  let reconnectAttempts = 0
  const backoffDelays = [100, 500, 2000]

  const createOptimisticMessage = (message: string): PlaygroundMessage => ({
    id: `optimistic-${Date.now()}`,
    runId: null,
    type: "user",
    content: message,
    toolCall: null,
    toolResult: null,
    createdAt: new Date().toISOString(),
  })

  const safeParse = <T,>(raw: string): T | null => {
    try {
      return JSON.parse(raw) as T
    } catch (e) {
      console.error("Failed to parse debug stream event", e)
      return null
    }
  }

  const playgroundStreamEventSchemas = {
    "message.created": (data: unknown) => {
      if (!data || typeof data !== "object") return false
      const message = (data as { message?: PlaygroundMessage }).message
      if (!message || typeof message !== "object") return false
      return typeof message.id === "string"
    },
    "human_request.created": (data: unknown) => {
      if (!data || typeof data !== "object") return false
      const humanRequest = (data as { humanRequest?: { id?: string } }).humanRequest
      return humanRequest && typeof humanRequest.id === "string"
    },
    "human_request.resolved": (data: unknown) => {
      if (!data || typeof data !== "object") return false
      const humanRequest = (data as { humanRequest?: { id?: string } }).humanRequest
      return humanRequest && typeof humanRequest.id === "string"
    },
    "session.status_changed": (data: unknown) => {
      if (!data || typeof data !== "object") return false
      const status = (data as { status?: string }).status
      return typeof status === "string"
    },
  } as const

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight
    })
  }

  const closeStream = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connectedSessionId = null
  }

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  const stopPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  const startPolling = () => {
    stopPolling()
    pollingTimer = window.setInterval(() => fetchMessages(), 10000)
  }

  const handleStreamError = (sessionId: string) => {
    closeStream()
    clearRetry()
    reconnectAttempts += 1
    if (reconnectAttempts <= 3) {
      const delay = backoffDelays[reconnectAttempts - 1] ?? 2000
      retryTimer = window.setTimeout(() => connectStream(sessionId), delay)
      return
    }
    startPolling()
  }

  const initSession = async () => {
    if (!props.agentId || !props.environmentId || !props.runtimeConfig) return
    setHistoryLoading(true)
    try {
      const res = await api.api.agents[":id"].playground.session.$post({
        param: { id: props.agentId },
      })
      if (!res.ok) throw new Error("Failed to create session")
      const data = await res.json()
      const nextSeq = deriveLastSeq(data.session as PlaygroundSessionData, null)
      if (typeof nextSeq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, nextSeq))
      }
      setSession(data.session as PlaygroundSessionData)
      if (!data.created) await fetchMessages()
      else setHistoryLoading(false)
    } catch (e) {
      console.error("Failed to init debug session", e)
      setHistoryLoading(false)
    }
  }

  const fetchMessages = async () => {
    const s = session()
    if (!s) return
    setHistoryLoading(true)
    try {
      const res = await api.api.agents[":id"].playground.session.$get({ param: { id: props.agentId } })
      if (!res.ok) throw new Error("Failed to fetch messages")
      const data = await res.json()
      setMessages(data.messages as PlaygroundMessage[])
      setHumanRequests((data.humanRequests ?? []) as PlaygroundHumanRequest[])
      setHumanResponses((data.humanResponses ?? []) as PlaygroundHumanResponse[])
      setOutputItems((data.outputItems ?? []) as PlaygroundOutputItem[])
      setRuns((data.runs ?? []) as PlaygroundRun[])
      setSession(data.session as PlaygroundSessionData)
      const nextSeq = deriveLastSeq(data.session as PlaygroundSessionData, null)
      if (typeof nextSeq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, nextSeq))
      }
      scrollToBottom()
    } catch (e) {
      console.error("Failed to fetch debug messages", e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const connectStream = (sessionId: string) => {
    if (connectedSessionId === sessionId && eventSource) return
    closeStream()
    clearRetry()
    connectedSessionId = sessionId

    const url = new URL(`/api/agents/${props.agentId}/playground/stream`, apiBaseURL || window.location.origin)
    url.searchParams.set("sessionId", sessionId)
    const seq = lastSeq() ?? session()?.seq ?? null
    if (seq !== null) {
      url.searchParams.set("fromSeq", String(seq))
    }

    eventSource = new EventSource(url.toString(), { withCredentials: true })

    eventSource.onopen = () => {
      reconnectAttempts = 0
      stopPolling()
    }

    eventSource.addEventListener("init", (e: Event) => {
      const me = e as MessageEvent
      const data = safeParse<{
        session: { id: string; status: PlaygroundStatus; seq?: number | null }
        lastSeq?: number
      }>(me.data)
      if (!data) return
      if (data.session.id !== sessionId) return
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: data.session.status,
              seq: data.session.seq ?? prev.seq,
            }
          : prev,
      )
      const nextSeq = deriveLastSeq({ seq: data.session.seq } as PlaygroundSessionData, data.lastSeq ?? null)
      if (typeof nextSeq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, nextSeq))
      }
    })

    eventSource.addEventListener("session.status_changed", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "session.status_changed"
        data: { status: PlaygroundStatus }
        updatedAt: string
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (!playgroundStreamEventSchemas["session.status_changed"](payload.data)) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setSession((prev) => {
        if (!prev) return prev
        return { ...prev, status: payload.data.status }
      })
      if (
        payload.data.status === "completed" ||
        payload.data.status === "failed" ||
        payload.data.status === "rejected" ||
        payload.data.status === "waiting_human"
      ) {
        setLoading(false)
      }
    })

    eventSource.addEventListener("thread.status_changed", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "thread.status_changed"
        data: { status: PlaygroundStatus }
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setSession((prev) => {
        if (!prev) return prev
        return { ...prev, status: payload.data.status }
      })
      if (
        payload.data.status === "completed" ||
        payload.data.status === "failed" ||
        payload.data.status === "rejected" ||
        payload.data.status === "waiting_human"
      ) {
        setLoading(false)
      }
    })

    eventSource.addEventListener("message.created", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "message.created"
        data: { message: PlaygroundMessage }
        updatedAt: string
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (!playgroundStreamEventSchemas["message.created"](payload.data)) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      const msg = payload.data.message as PlaygroundMessage
      setMessages((prev) => upsertMessage(prev, msg))
      scrollToBottom()
    })

    eventSource.addEventListener("human_request.created", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "human_request.created"
        data: { humanRequest: PlaygroundHumanRequest }
        updatedAt: string
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (!playgroundStreamEventSchemas["human_request.created"](payload.data)) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      const hr = payload.data.humanRequest
      setHumanRequests((prev) => {
        const exists = prev.some((r) => r.id === hr.id)
        if (exists) return prev.map((r) => (r.id === hr.id ? hr : r))
        return [...prev, hr]
      })
    })

    eventSource.addEventListener("human_request.resolved", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "human_request.resolved"
        data: { humanRequest: PlaygroundHumanRequest; response: PlaygroundHumanResponse }
        updatedAt: string
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (!playgroundStreamEventSchemas["human_request.resolved"](payload.data)) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      const hr = payload.data.humanRequest
      const resp = payload.data.response
      setHumanRequests((prev) => {
        const exists = prev.some((r) => r.id === hr.id)
        if (exists) return prev.map((r) => (r.id === hr.id ? hr : r))
        return [...prev, hr]
      })
      setHumanResponses((prev) => {
        const exists = prev.some((r) => r.id === resp.id)
        if (exists) return prev.map((r) => (r.id === resp.id ? resp : r))
        return [...prev, resp]
      })
    })

    eventSource.addEventListener("output_item.created", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "output_item.created"
        data: { outputItem: PlaygroundOutputItem }
        updatedAt: string
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      const item = payload.data.outputItem
      setOutputItems((prev) => {
        const exists = prev.some((o) => o.id === item.id)
        if (exists) return prev
        return [...prev, item]
      })
      scrollToBottom()
    })

    eventSource.addEventListener("run.created", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "run.created"
        data: { run: PlaygroundRun }
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setRuns((prev) => upsertRun(prev, payload.data.run))
    })

    eventSource.addEventListener("run.updated", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "run.updated"
        data: { run: PlaygroundRun }
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setRuns((prev) => upsertRun(prev, payload.data.run))
    })

    eventSource.addEventListener("run.completed", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "run.completed"
        data: { run: PlaygroundRun }
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setRuns((prev) => upsertRun(prev, payload.data.run))
    })

    eventSource.addEventListener("run.failed", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "run.failed"
        data: { run: PlaygroundRun }
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setRuns((prev) => upsertRun(prev, payload.data.run))
    })

    eventSource.addEventListener("run.cancelled", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "run.cancelled"
        data: { run: PlaygroundRun }
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setRuns((prev) => upsertRun(prev, payload.data.run))
    })

    eventSource.addEventListener("run.rejected", (e: Event) => {
      const me = e as MessageEvent
      const payload = safeParse<{
        seq: number
        sessionId: string
        type: "run.rejected"
        data: { run: PlaygroundRun }
      }>(me.data)
      if (!payload) return
      if (payload.sessionId !== sessionId) return
      if (typeof payload.seq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      }
      setRuns((prev) => upsertRun(prev, payload.data.run))
    })

    eventSource.addEventListener("resync_required", () => {
      setLastSeq(null)
      fetchMessages()
    })

    eventSource.addEventListener("error", (e: Event) => {
      const me = e as MessageEvent
      try {
        const data = JSON.parse(me.data)
        console.error("Debug stream error:", data.data?.error)
      } catch {
        console.error("Debug stream connection error")
      }
      setLoading(false)
    })

    eventSource.onerror = () => handleStreamError(sessionId)
  }

  createEffect(
    on(
      () => [props.agentId, props.environmentId] as const,
      () => {
        closeStream()
        clearRetry()
        stopPolling()
        setSession(null)
        setMessages([])
        setHumanRequests([])
        setHumanResponses([])
        setOutputItems([])
        setRuns([])
        setInput("")
        setLoading(false)
        setLastSeq(null)
        initSession()
      },
    ),
  )

  createEffect(
    on(
      () => session()?.id,
      (id) => id && connectStream(id),
    ),
  )

  createEffect(
    on(
      () => props.runtimeConfig,
      (config, prevConfig) => {
        if (!prevConfig && config && !session()) {
          initSession()
        }
      },
    ),
  )

  onMount(() => {
    const id = session()?.id
    if (id && !eventSource) {
      connectStream(id)
    }
  })

  onCleanup(() => {
    closeStream()
    clearRetry()
    stopPolling()
  })

  const handleSend = async () => {
    const message = input().trim()
    const s = session()
    if (!message || loading() || !s) return

    const optimisticMessage = createOptimisticMessage(message)
    setMessages((prev) => [...prev, optimisticMessage])
    setSession((prev) => (prev ? { ...prev, status: "running" } : prev))
    setInput("")
    setLoading(true)
    scrollToBottom()

    try {
      const res = await api.api.agents[":id"].playground.messages.$post({
        param: { id: props.agentId },
        json: { sessionId: s.id, environmentId: props.environmentId!, runtimeConfig: props.runtimeConfig!, message },
      })
      if (!res.ok) throw new Error("Failed to send message")
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
      setSession((prev) => (prev ? { ...prev, status: "waiting_human" } : prev))
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey && input().trim() && !loading()) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = async () => {
    const res = await api.api.agents[":id"].playground.session.clear.$post({ param: { id: props.agentId } })
    if (!res.ok) return
    closeStream()
    clearRetry()
    stopPolling()
    setLoading(false)
    setMessages([])
    setHumanRequests([])
    setHumanResponses([])
    setOutputItems([])
    setRuns([])
    setLastSeq(null)
    setSession((prev) =>
      prev
        ? {
            ...prev,
            status: "waiting_human",
            seq: 0,
          }
        : prev,
    )
    await fetchMessages()
    const next = session()
    if (next) connectStream(next.id)
  }

  const handleApprove = async (requestId: string) => {
    setApproving(true)
    try {
      const res = await api.api.agents[":id"].playground.approvals[":approvalId"].approve.$post({
        param: { id: props.agentId, approvalId: requestId },
        json: {},
      })
      if (!res.ok) throw new Error("Failed to approve")
    } catch (e) {
      console.error("Failed to approve", e)
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async (requestId: string) => {
    setRejecting(true)
    try {
      const res = await api.api.agents[":id"].playground.approvals[":approvalId"].reject.$post({
        param: { id: props.agentId, approvalId: requestId },
        json: {},
      })
      if (!res.ok) throw new Error("Failed to reject")
    } catch (e) {
      console.error("Failed to reject", e)
    } finally {
      setRejecting(false)
    }
  }

  const hasPendingApproval = () => humanRequests().some((r) => r.kind === "approval" && r.status === "pending")
  const hasPendingHumanRequest = () => humanRequests().some((r) => r.status === "pending")
  const canReply = () => {
    const s = session()
    if (s?.status === "completed" || s?.status === "rejected") return true
    if (s?.status === "waiting_human") return !hasPendingApproval()
    return false
  }

  const handleHumanRequestRespond = async (
    requestId: string,
    action: "respond" | "cancel" | "skip",
    data?: unknown,
  ) => {
    setResponding(true)
    try {
      const statusMap = { respond: "responded", cancel: "cancelled", skip: "skipped" } as const
      const status = statusMap[action]
      const res = await api.api.agents[":id"].playground["human-requests"][":requestId"].respond.$post({
        param: { id: props.agentId, requestId },
        json: { status, data },
      })
      if (!res.ok) throw new Error("Failed to respond to human request")
    } catch (e) {
      console.error("Failed to respond to human request", e)
    } finally {
      setResponding(false)
    }
  }

  const timeline = createMemo(() =>
    buildTimeline({
      messages: messages(),
      humanRequests: humanRequests(),
      outputItems: outputItems(),
      humanResponses: humanResponses(),
      runs: runs(),
      sessionStatus: session()?.status,
    }),
  )

  return (
    <div class="flex h-full flex-col bg-surface-elevated">
      <div class="flex h-7 shrink-0 items-center justify-between border-b border-border px-2.5">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
            classList={{
              "bg-accent/10 text-accent": activeTab() === "chat",
              "text-text-muted hover:text-text": activeTab() !== "chat",
            }}
            onClick={() => setActiveTab("chat")}
          >
            <ChatCircle class="h-3 w-3" weight={activeTab() === "chat" ? "duotone" : "regular"} />
            Chat
          </button>
          <button
            type="button"
            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
            classList={{
              "bg-accent/10 text-accent": activeTab() === "tool_tester",
              "text-text-muted hover:text-text": activeTab() !== "tool_tester",
            }}
            onClick={() => setActiveTab("tool_tester")}
          >
            <Wrench class="h-3 w-3" weight={activeTab() === "tool_tester" ? "duotone" : "regular"} />
            Tool
          </button>
          <Show when={activeTab() === "chat" ? session() : undefined} keyed>
            {(s) => (
              <Badge variant={s.status === "running" ? "default" : "secondary"} class="text-[9px] ml-1">
                {s.status}
              </Badge>
            )}
          </Show>
        </div>
        <Show when={activeTab() === "chat"}>
          <button
            type="button"
            class="rounded p-0.5 text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
            onClick={handleClear}
            title="Clear session"
          >
            <Trash class="h-3 w-3" />
          </button>
        </Show>
      </div>

      <Show when={activeTab() === "chat"}>
        <div ref={scrollRef} class="flex-1 overflow-y-auto scrollbar-thin">
          <Show when={historyLoading()}>
            <div class="flex h-full items-center justify-center">
              <Spinner size="sm" />
            </div>
          </Show>
          <Show when={!historyLoading()}>
            <Show
              when={messages().length > 0}
              fallback={
                <div class="flex h-full flex-col items-center justify-center px-3 text-center">
                  <Bug class="h-6 w-6 text-accent/30 mb-2" weight="duotone" />
                  <p class="text-[10px] text-text-muted mb-0.5">Debug your agent</p>
                  <p class="text-[9px] text-text-muted/70 max-w-[180px]">
                    Send a message to test your agent configuration in real-time
                  </p>
                </div>
              }
            >
              <div class="flex flex-col gap-2.5 p-2.5">
                <For each={timeline()}>
                  {(item) => (
                    <>
                      <Show when={item.type === "user"}>
                        <UserMessage message={(item as { type: "user"; message: PlaygroundMessage }).message} />
                      </Show>
                      <Show when={item.type === "agent" ? item : undefined}>
                        {(agentItem) => (
                          <AgentMessage
                            message={agentItem().message}
                            createdAt={agentItem().createdAt}
                            tools={agentItem().tools}
                            outputs={agentItem().outputs}
                            agent={props.agent}
                            runs={runs()}
                            status={agentItem().status}
                            delegatedTo={agentItem().delegatedTo}
                            subagentWorks={agentItem().subagentWorks}
                            pendingHumanRequest={agentItem().pendingHumanRequest}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            approving={approving()}
                            rejecting={rejecting()}
                            onHumanRequestRespond={handleHumanRequestRespond}
                            responding={responding()}
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
                <Show when={session()?.status === "failed"}>
                  <div class="flex gap-2">
                    <AgentIcon
                      icon={props.agent?.icon ?? null}
                      iconColor={props.agent?.iconColor ?? null}
                      size={20}
                      rounded="md"
                    />
                    <div class="flex-1 min-w-0">
                      <Badge variant="destructive" class="text-2xs">
                        Failed
                      </Badge>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </div>

        <div class="shrink-0 border-t border-border p-2">
          <div class="rounded border border-border bg-surface overflow-hidden">
            <Textarea
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message to debug..."
              disabled={loading() || !session() || (messages().length > 0 && !canReply())}
              variant="surface"
              rows={2}
              class="border-none shadow-none focus-visible:shadow-none resize-none text-xs"
            />
            <div class="h-7 flex items-center gap-2 px-2">
              <span class="flex-1" />
              <span class="text-2xs text-text-muted">⌘↵</span>
              <Button
                variant="default"
                size="xs"
                onClick={handleSend}
                disabled={loading() || !input().trim() || !session()}
                class="h-5 text-2xs px-2"
              >
                <Show when={loading()} fallback={<ArrowUp class="h-2.5 w-2.5" weight="bold" />}>
                  <Spinner size="xs" class="border-white border-t-transparent" />
                </Show>
              </Button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={activeTab() === "tool_tester"}>
        <div class="flex-1 min-h-0 overflow-hidden">
          <ToolTester agentId={props.agentId} environmentId={props.environmentId} runtimeConfig={props.runtimeConfig} />
        </div>
      </Show>
    </div>
  )
}
