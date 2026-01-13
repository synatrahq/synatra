import { Show, For, createSignal, createEffect, onCleanup, createMemo, on } from "solid-js"
import { Button, Spinner } from "../../../../ui"
import { Sparkle, Plus } from "phosphor-solid-js"
import { api, apiBaseURL } from "../../../../app"
import type {
  CopilotThread,
  CopilotMessage,
  CopilotProposal,
  CopilotResourceRequest,
  CopilotTriggerRequest,
  CopilotTriggerConfig,
  StreamStatus,
  ToolCallStreaming,
  InFlightState,
  CopilotToolLog,
  CopilotModel,
  CopilotPanelProps,
  CopilotQuestionRequest,
  CopilotQuestionResult,
} from "./types"
import { Header } from "./header"
import { MessageItem } from "./message-item"
import { StreamingMessage } from "./streaming-message"
import { InputForm } from "./input-form"
import { QuestionForm } from "./question-form"

export function CopilotPanel(props: CopilotPanelProps) {
  const [threads, setThreads] = createSignal<CopilotThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<CopilotMessage[]>([])
  const [proposals, setProposals] = createSignal<CopilotProposal[]>([])
  const [input, setInput] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [historyLoading, setHistoryLoading] = createSignal(true)
  const [streamStatus, setStreamStatus] = createSignal<StreamStatus>("idle")
  const [streamingText, setStreamingText] = createSignal("")
  const [reasoningText, setReasoningText] = createSignal("")
  const [reasoningExpanded, setReasoningExpanded] = createSignal(false)
  const [toolCalls, setToolCalls] = createSignal<ToolCallStreaming[]>([])
  const [toolsExpanded, setToolsExpanded] = createSignal(false)
  const [availableModels, setAvailableModels] = createSignal<CopilotModel[]>([])
  const [selectedModel, setSelectedModel] = createSignal<string | null>(null)
  const [approving, setApproving] = createSignal(false)
  const [rejecting, setRejecting] = createSignal(false)
  const [lastSeq, setLastSeq] = createSignal<number | null>(null)
  const [toolLogs, setToolLogs] = createSignal<CopilotToolLog[]>([])
  const [resourceRequests, setResourceRequests] = createSignal<CopilotResourceRequest[]>([])
  const [triggerRequests, setTriggerRequests] = createSignal<CopilotTriggerRequest[]>([])
  const [questionRequest, setQuestionRequest] = createSignal<CopilotQuestionRequest | null>(null)
  const [questionSubmitting, setQuestionSubmitting] = createSignal(false)
  let messagesEndRef: HTMLDivElement | undefined
  let eventSource: EventSource | null = null
  let connectedThreadId: string | null = null
  let retryTimer: number | null = null
  let pollingTimer: number | null = null
  let reconnectAttempts = 0
  const backoffDelays = [100, 500, 2000]

  const pendingProposal = createMemo(() => {
    return proposals().find((p) => p.status === "pending") ?? null
  })

  const pendingResourceRequest = createMemo(() => {
    return resourceRequests().find((r) => r.status === "pending") ?? null
  })

  const pendingTriggerRequest = createMemo(() => {
    return triggerRequests().find((r) => r.status === "pending") ?? null
  })

  createEffect(() => {
    props.onProposalChange?.(pendingProposal())
  })

  createEffect(() => {
    props.onResourceRequestChange?.(pendingResourceRequest())
  })

  createEffect(() => {
    props.onTriggerRequestChange?.(pendingTriggerRequest())
  })

  createEffect(() => {
    props.onApprovingChange?.(approving())
  })

  createEffect(() => {
    props.onRejectingChange?.(rejecting())
  })

  createEffect(() => {
    props.onLoadingChange?.(loading())
  })

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const container = messagesEndRef?.parentElement?.parentElement
      if (container && container.classList.contains("overflow-y-auto")) {
        container.scrollTop = container.scrollHeight
      }
    })
  }

  const closeStream = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connectedThreadId = null
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

  const startPolling = (threadId: string) => {
    stopPolling()
    pollingTimer = window.setInterval(() => fetchMessages(threadId), 10000)
  }

  const handleStreamError = (threadId: string) => {
    closeStream()
    clearRetry()
    reconnectAttempts += 1
    if (reconnectAttempts <= 3) {
      const delay = backoffDelays[reconnectAttempts - 1] ?? 2000
      retryTimer = window.setTimeout(() => connectStream(threadId), delay)
      return
    }
    startPolling(threadId)
  }

  const fetchThreads = async () => {
    if (!props.agentId) return
    try {
      const res = await api.api.agents[":id"].copilot.threads.$get({ param: { id: props.agentId } })
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads)
        if (data.threads.length > 0 && !selectedThreadId()) {
          setSelectedThreadId(data.threads[0].id)
        } else if (data.threads.length === 0) {
          setHistoryLoading(false)
        }
      }
    } catch (e) {
      console.error("Failed to fetch threads", e)
      setHistoryLoading(false)
    }
  }

  const fetchModels = async () => {
    if (!props.agentId) return
    const res = await api.api.agents[":id"].copilot.models.$get({
      param: { id: props.agentId },
    })
    if (!res.ok) return
    const data = await res.json()
    setAvailableModels(data.models)
    if (data.models.length > 0 && !selectedModel()) {
      setSelectedModel(data.models[0].id)
    }
  }

  const fetchToolLogs = async (threadId: string) => {
    if (!props.agentId) return
    try {
      const res = await api.api.agents[":id"].copilot.threads[":threadId"].logs.$get({
        param: { id: props.agentId, threadId },
      })
      if (res.ok) {
        const data = await res.json()
        setToolLogs(data.logs as CopilotToolLog[])
      }
    } catch (e) {
      console.error("Failed to fetch tool logs", e)
    }
  }

  const addErrorMessage = (text: string) => {
    const errorMessage: CopilotMessage = {
      id: `error-${Date.now()}`,
      role: "assistant",
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, errorMessage])
  }

  const createThread = async () => {
    if (!props.agentId) return
    const res = await api.api.agents[":id"].copilot.threads.$post({
      param: { id: props.agentId },
      json: {},
    })
    if (!res.ok) {
      addErrorMessage("Failed to create conversation. Please try again.")
      return
    }
    const data = await res.json()
    setThreads((prev) => [data.thread, ...prev])
    setSelectedThreadId(data.thread.id)
    setMessages([])
    setProposals([])
  }

  const restoreInFlightState = (state: InFlightState, msgs: CopilotMessage[]) => {
    if (loading()) return
    const lastMsg = msgs[msgs.length - 1]
    const isCompleted = lastMsg?.role === "assistant"
    const isPending = lastMsg?.role === "user"
    if (!state && isPending) {
      setStreamStatus("thinking")
      setStreamingText("")
      setReasoningText("")
      setToolCalls([])
      setLoading(true)
      return
    }
    if (!state || isCompleted) {
      setStreamStatus("idle")
      setStreamingText("")
      setReasoningText("")
      setToolCalls([])
      setLoading(false)
      setReasoningExpanded(false)
      setToolsExpanded(false)
      return
    }
    setStreamStatus(state.status)
    setReasoningText(state.reasoningText)
    setStreamingText(state.streamingText)
    setToolCalls(state.toolCalls)
    setLoading(state.status !== "idle")
  }

  const fetchMessages = async (threadId: string) => {
    if (!props.agentId) return
    setHistoryLoading(true)
    try {
      const res = await api.api.agents[":id"].copilot.threads[":threadId"].$get({
        param: { id: props.agentId, threadId },
      })
      if (res.ok) {
        const data = await res.json()
        const parsedMessages = data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls as CopilotMessage["toolCalls"],
          createdAt: m.createdAt,
        }))
        setMessages(parsedMessages)
        setProposals(
          data.proposals.map((p) => ({
            id: p.id,
            config: p.config as CopilotProposal["config"],
            explanation: p.explanation,
            status: p.status as CopilotProposal["status"],
            createdAt: p.createdAt,
          })),
        )
        setResourceRequests(
          (data.resourceRequests ?? []).map((r) => ({
            id: r.id,
            explanation: r.explanation,
            suggestions: r.suggestions as CopilotResourceRequest["suggestions"],
            status: r.status as CopilotResourceRequest["status"],
            resourceId: r.resourceId,
            createdAt: r.createdAt,
          })),
        )
        setTriggerRequests(
          (data.triggerRequests ?? []).map((r) => ({
            id: r.id,
            action: r.action as CopilotTriggerRequest["action"],
            triggerId: r.triggerId,
            explanation: r.explanation,
            config: r.config as CopilotTriggerConfig,
            status: r.status as CopilotTriggerRequest["status"],
            createdAt: r.createdAt,
          })),
        )
        const pendingQuestion = (data.questionRequests ?? []).find((q: { status: string }) => q.status === "pending")
        if (pendingQuestion) {
          setQuestionRequest({
            toolCallId: pendingQuestion.toolCallId,
            questions: pendingQuestion.questions as CopilotQuestionRequest["questions"],
          })
        } else {
          setQuestionRequest(null)
        }
        const inFlight = data.thread.inFlightState as InFlightState
        restoreInFlightState(inFlight, parsedMessages)
        await fetchToolLogs(threadId)
        scrollToBottom()
      }
    } catch (e) {
      console.error("Failed to fetch messages", e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const safeParse = <T,>(raw: string): T | null => {
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  const updateSeq = (seq: number | undefined) => {
    if (typeof seq === "number") {
      setLastSeq((prev) => Math.max(prev ?? 0, seq))
    }
  }

  const connectStream = (threadId: string) => {
    if (connectedThreadId === threadId && eventSource) return
    closeStream()
    clearRetry()
    connectedThreadId = threadId

    const url = new URL(
      `/api/agents/${props.agentId}/copilot/threads/${threadId}/stream`,
      apiBaseURL || window.location.origin,
    )
    const seq = lastSeq()
    if (seq !== null) {
      url.searchParams.set("fromSeq", String(seq))
    }

    eventSource = new EventSource(url.toString(), { withCredentials: true })

    eventSource.onopen = () => {
      reconnectAttempts = 0
      stopPolling()
    }

    eventSource.addEventListener("init", (e) => {
      const payload = safeParse<{ thread: { seq?: number | null }; lastSeq?: number }>(e.data)
      if (!payload) return
      const nextSeq = payload.lastSeq ?? payload.thread.seq
      if (typeof nextSeq === "number") {
        setLastSeq((prev) => Math.max(prev ?? 0, nextSeq))
      }
    })

    eventSource.addEventListener("resync_required", () => {
      setLastSeq(null)
      fetchMessages(threadId)
    })

    eventSource.addEventListener("copilot.thinking", (e) => {
      const payload = safeParse<{ seq?: number }>(e.data)
      updateSeq(payload?.seq)
      setStreamStatus("thinking")
      setStreamingText("")
      setReasoningText("")
      setToolCalls([])
      setReasoningExpanded(false)
      setToolsExpanded(false)
      setLoading(true)
    })

    eventSource.addEventListener("copilot.reasoning_delta", (e) => {
      const payload = safeParse<{ seq?: number; data: { delta: string } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      setStreamStatus("reasoning")
      setReasoningText((prev) => prev + payload.data.delta)
    })

    eventSource.addEventListener("copilot.tool_call.streaming_start", (e) => {
      const payload = safeParse<{ seq?: number; data: { toolCallId: string; toolName: string } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      setStreamStatus("tool_call")
      const existing = toolCalls().find((tc) => tc.toolCallId === payload.data.toolCallId)
      if (!existing) {
        setToolCalls((prev) => [
          ...prev,
          { toolCallId: payload.data.toolCallId, toolName: payload.data.toolName, argsText: "", status: "streaming" },
        ])
      }
    })

    eventSource.addEventListener("copilot.tool_call.input_delta", (e) => {
      const payload = safeParse<{ seq?: number; data: { toolCallId: string; delta: string } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      setToolCalls((prev) =>
        prev.map((tc) =>
          tc.toolCallId === payload.data.toolCallId ? { ...tc, argsText: tc.argsText + payload.data.delta } : tc,
        ),
      )
    })

    eventSource.addEventListener("copilot.tool_call.executing", (e) => {
      const payload = safeParse<{ seq?: number; data: { toolCallId: string; toolName: string } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      setStreamStatus("tool_call")
      setToolCalls((prev) => {
        const existing = prev.find((tc) => tc.toolCallId === payload.data.toolCallId)
        if (existing) {
          return prev.map((tc) =>
            tc.toolCallId === payload.data.toolCallId ? { ...tc, status: "executing" as const } : tc,
          )
        }
        return [
          ...prev,
          { toolCallId: payload.data.toolCallId, toolName: payload.data.toolName, argsText: "", status: "executing" },
        ]
      })
    })

    eventSource.addEventListener("copilot.tool_call.done", (e) => {
      const payload = safeParse<{ seq?: number; data: { toolCallId: string } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      setToolCalls((prev) =>
        prev.map((tc) => (tc.toolCallId === payload.data.toolCallId ? { ...tc, status: "completed" as const } : tc)),
      )
    })

    eventSource.addEventListener("copilot.tool_log", (e) => {
      const payload = safeParse<{
        seq?: number
        data: { log: { toolName: string; toolCallId?: string; status: string } }
      }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      if (payload.data.log.status === "started") {
        setStreamStatus("tool_call")
      }
    })

    eventSource.addEventListener("copilot.text_delta", (e) => {
      const payload = safeParse<{ seq?: number; data: { delta: string } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      setStreamStatus("streaming")
      setStreamingText((prev) => prev + payload.data.delta)
    })

    eventSource.addEventListener("copilot.message.created", (e) => {
      const payload = safeParse<{ seq?: number; data: { message: CopilotMessage } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const message = payload.data.message
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === message.id)
        if (existing) return prev
        const filtered = prev.filter((m) => !m.id.startsWith("optimistic-") || m.role !== message.role)
        return [...filtered, message]
      })
      scrollToBottom()
    })

    eventSource.addEventListener("copilot.proposal.created", (e) => {
      const payload = safeParse<{ seq?: number; data: { proposal: CopilotProposal } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const proposal = payload.data.proposal
      setProposals((prev) => {
        const updated = prev.map((p) => (p.status === "pending" ? { ...p, status: "rejected" as const } : p))
        return [proposal, ...updated]
      })
    })

    eventSource.addEventListener("copilot.proposal.approved", (e) => {
      const payload = safeParse<{ seq?: number; data: { proposal: CopilotProposal } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const { proposal } = payload.data
      setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, status: "approved" as const } : p)))
    })

    eventSource.addEventListener("copilot.proposal.rejected", (e) => {
      const payload = safeParse<{ seq?: number; data: { proposal: CopilotProposal } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const { proposal } = payload.data
      setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, status: "rejected" as const } : p)))
    })

    eventSource.addEventListener("copilot.resource_request.created", (e) => {
      const payload = safeParse<{ seq?: number; data: { resourceRequest: CopilotResourceRequest } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const request = payload.data.resourceRequest
      setResourceRequests((prev) => {
        const updated = prev.map((r) => (r.status === "pending" ? { ...r, status: "cancelled" as const } : r))
        return [request, ...updated]
      })
    })

    eventSource.addEventListener("copilot.resource_request.completed", (e) => {
      const payload = safeParse<{
        seq?: number
        data: { resourceRequest: CopilotResourceRequest; resourceId: string; resourceSlug: string }
      }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const { resourceRequest, resourceId, resourceSlug } = payload.data
      setResourceRequests((prev) =>
        prev.map((r) => (r.id === resourceRequest.id ? { ...r, status: "completed" as const, resourceId } : r)),
      )
      setTimeout(() => sendResourceConnectedMessage(resourceId, resourceSlug), 500)
    })

    eventSource.addEventListener("copilot.resource_request.cancelled", (e) => {
      const payload = safeParse<{ seq?: number; data: { resourceRequest: CopilotResourceRequest } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const { resourceRequest } = payload.data
      setResourceRequests((prev) =>
        prev.map((r) => (r.id === resourceRequest.id ? { ...r, status: "cancelled" as const } : r)),
      )
    })

    eventSource.addEventListener("copilot.trigger_request.created", (e) => {
      const payload = safeParse<{ seq?: number; data: { triggerRequest: CopilotTriggerRequest } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const request = payload.data.triggerRequest
      setTriggerRequests((prev) => {
        const updated = prev.map((r) => (r.status === "pending" ? { ...r, status: "cancelled" as const } : r))
        return [request, ...updated]
      })
    })

    eventSource.addEventListener("copilot.trigger_request.completed", (e) => {
      const payload = safeParse<{
        seq?: number
        data: { triggerRequest: CopilotTriggerRequest; trigger?: { id: string; name: string } }
      }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const { triggerRequest, trigger } = payload.data
      setTriggerRequests((prev) =>
        prev.map((r) => (r.id === triggerRequest.id ? { ...r, status: "completed" as const } : r)),
      )
      if (trigger) {
        setTimeout(() => sendTriggerApprovedMessage(trigger.name, triggerRequest.action), 500)
      }
    })

    eventSource.addEventListener("copilot.trigger_request.cancelled", (e) => {
      const payload = safeParse<{ seq?: number; data: { triggerRequest: CopilotTriggerRequest } }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      const { triggerRequest } = payload.data
      setTriggerRequests((prev) =>
        prev.map((r) => (r.id === triggerRequest.id ? { ...r, status: "cancelled" as const } : r)),
      )
    })

    eventSource.addEventListener("copilot.questions.rendered", (e) => {
      const payload = safeParse<{
        seq?: number
        data: { toolCallId: string; questions: CopilotQuestionRequest["questions"] }
      }>(e.data)
      if (!payload) return
      updateSeq(payload.seq)
      setQuestionRequest({
        toolCallId: payload.data.toolCallId,
        questions: payload.data.questions,
      })
      setStreamStatus("idle")
      setStreamingText("")
      setReasoningText("")
      setToolCalls([])
      setLoading(false)
      scrollToBottom()
    })

    eventSource.addEventListener("copilot.questions.submitted", (e) => {
      const payload = safeParse<{ seq?: number; data: { toolCallId: string; answers: CopilotQuestionResult[] } }>(
        e.data,
      )
      if (!payload) return
      updateSeq(payload.seq)
      setQuestionRequest(null)
    })

    eventSource.addEventListener("copilot.completed", (e) => {
      const payload = safeParse<{ seq?: number }>(e.data)
      updateSeq(payload?.seq)
      setStreamStatus("idle")
      setStreamingText("")
      setReasoningText("")
      setToolCalls([])
      setLoading(false)
      setQuestionRequest(null)
    })

    eventSource.addEventListener("copilot.error", (e) => {
      const payload = safeParse<{ seq?: number; data: { error: string } }>(e.data)
      updateSeq(payload?.seq)
      console.error("Copilot error:", payload?.data?.error)
      setStreamStatus("idle")
      setReasoningText("")
      setToolCalls([])
      setLoading(false)
      setQuestionRequest(null)
    })

    eventSource.onerror = () => handleStreamError(threadId)
  }

  createEffect(
    on(
      () => props.agentId,
      (agentId) => {
        if (!agentId) return
        closeStream()
        clearRetry()
        stopPolling()
        reconnectAttempts = 0
        setSelectedThreadId(null)
        setThreads([])
        setMessages([])
        setProposals([])
        setStreamStatus("idle")
        setStreamingText("")
        setReasoningText("")
        setToolCalls([])
        setLoading(false)
        setHistoryLoading(true)
        setLastSeq(null)
        fetchThreads()
        fetchModels()
      },
    ),
  )

  createEffect(
    on(
      () => selectedThreadId(),
      (threadId) => {
        if (!threadId) return
        closeStream()
        clearRetry()
        stopPolling()
        reconnectAttempts = 0
        setLastSeq(null)
        fetchMessages(threadId)
        connectStream(threadId)
      },
    ),
  )

  let startCopilotHandled = false
  createEffect(
    on(
      () => [props.startCopilot, props.templateId, historyLoading(), props.currentConfig] as const,
      async ([startCopilot, templateId, isLoading, config]) => {
        if (!startCopilot || startCopilotHandled || isLoading || loading() || !config) return
        startCopilotHandled = true
        props.onStartCopilotHandled?.()

        try {
          let prompt: string | null = null
          if (templateId) {
            const res = await api.api.agents.templates[":id"].$get({
              param: { id: templateId },
            })
            if (res.ok) {
              const data = await res.json()
              prompt = data.template?.prompt ?? null
            }
          }

          const greeting = prompt
            ? prompt
            : "I'm a new agent. Help me configure this agent based on my needs. Let's start with understanding what I want to build."

          const optimisticId = `optimistic-${Date.now()}`
          const optimisticMessage: CopilotMessage = {
            id: optimisticId,
            role: "user",
            content: greeting,
            createdAt: new Date().toISOString(),
          }

          setMessages((prev) => [...prev, optimisticMessage])
          setLoading(true)
          setStreamStatus("connecting")
          scrollToBottom()

          const msgRes = await api.api.agents[":id"].copilot.messages.$post({
            param: { id: props.agentId },
            json: {
              message: greeting,
              threadId: selectedThreadId() ?? undefined,
              currentConfig: config,
              environmentId: props.environmentId ?? undefined,
              model: selectedModel() ?? undefined,
            },
          })

          if (!msgRes.ok) throw new Error("Failed to send message")

          const data = await msgRes.json()
          if (data.threadCreated) {
            const title = greeting.slice(0, 50) + (greeting.length > 50 ? "..." : "")
            const newThread: CopilotThread = {
              id: data.threadId,
              title,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            setThreads((prev) => [newThread, ...prev])
            setSelectedThreadId(data.threadId)
          }
        } catch (e) {
          console.error("Failed to auto-start copilot:", e)
          addErrorMessage("Failed to start. Please try again.")
          setLoading(false)
          setStreamStatus("idle")
        }
      },
    ),
  )

  onCleanup(() => {
    closeStream()
    clearRetry()
    stopPolling()
  })

  const handleSend = async () => {
    const message = input().trim()
    const threadId = selectedThreadId()
    if (!message || loading() || !props.currentConfig) return

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMessage: CopilotMessage = {
      id: optimisticId,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setInput("")
    setLoading(true)
    setStreamStatus("connecting")
    scrollToBottom()

    try {
      const res = await api.api.agents[":id"].copilot.messages.$post({
        param: { id: props.agentId },
        json: {
          message,
          threadId: threadId ?? undefined,
          currentConfig: props.currentConfig,
          pendingProposalConfig: pendingProposal()?.config ?? undefined,
          environmentId: props.environmentId ?? undefined,
          model: selectedModel() ?? undefined,
        },
      })

      if (!res.ok) {
        throw new Error("Failed to send message")
      }

      const data = await res.json()

      if (data.threadCreated) {
        const title = message.slice(0, 50) + (message.length > 50 ? "..." : "")
        const newThread: CopilotThread = {
          id: data.threadId,
          title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        setThreads((prev) => [newThread, ...prev])
        setSelectedThreadId(data.threadId)
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      addErrorMessage("Failed to get response. Please try again.")
      setLoading(false)
      setStreamStatus("idle")
    }
  }

  const handleDeleteThread = async () => {
    const threadId = selectedThreadId()
    if (!threadId) return
    const res = await api.api.agents[":id"].copilot.threads[":threadId"].$delete({
      param: { id: props.agentId, threadId },
    })
    if (!res.ok) {
      addErrorMessage("Failed to delete conversation. Please try again.")
      return
    }
    const remaining = threads().filter((t) => t.id !== threadId)
    setThreads(remaining)
    if (remaining.length > 0) {
      setSelectedThreadId(remaining[0].id)
    } else {
      closeStream()
      clearRetry()
      stopPolling()
      reconnectAttempts = 0
      setSelectedThreadId(null)
      setMessages([])
      setProposals([])
      setStreamStatus("idle")
      setLastSeq(null)
    }
  }

  const handleApprove = async () => {
    const proposal = pendingProposal()
    if (!proposal) return
    setApproving(true)
    const res = await api.api.agents[":id"].copilot.proposals[":proposalId"].approve.$post({
      param: { id: props.agentId, proposalId: proposal.id },
    })
    setApproving(false)
    if (!res.ok) {
      addErrorMessage("Failed to apply changes. Please try again.")
      return
    }
    const data = await res.json()
    if (data.alreadyDecided) {
      const status = data.proposal.status as "approved" | "rejected"
      setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, status } : p)))
      addErrorMessage("This proposal was already decided.")
      return
    }
    setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, status: "approved" as const } : p)))
    props.onApply(proposal.config)
  }

  const handleReject = async () => {
    const proposal = pendingProposal()
    if (!proposal) return
    setRejecting(true)
    const res = await api.api.agents[":id"].copilot.proposals[":proposalId"].reject.$post({
      param: { id: props.agentId, proposalId: proposal.id },
    })
    setRejecting(false)
    if (!res.ok) {
      addErrorMessage("Failed to reject changes. Please try again.")
      return
    }
    const data = await res.json()
    if (data.alreadyDecided) {
      const status = data.proposal.status as "approved" | "rejected"
      setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, status } : p)))
      addErrorMessage("This proposal was already decided.")
      return
    }
    setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, status: "rejected" as const } : p)))
  }

  const sendResourceConnectedMessage = async (resourceId: string, resourceSlug: string) => {
    const threadId = selectedThreadId()
    if (!threadId || loading() || !props.currentConfig) return

    const message = `I've connected a new resource: \`${resourceSlug}\`. Please continue with the agent configuration using this resource.`
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMessage: CopilotMessage = {
      id: optimisticId,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setLoading(true)
    setStreamStatus("connecting")
    scrollToBottom()

    try {
      const res = await api.api.agents[":id"].copilot.messages.$post({
        param: { id: props.agentId },
        json: {
          message,
          threadId,
          currentConfig: props.currentConfig,
          pendingProposalConfig: pendingProposal()?.config ?? undefined,
          environmentId: props.environmentId ?? undefined,
          model: selectedModel() ?? undefined,
        },
      })

      if (!res.ok) throw new Error("Failed to send continuation message")
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      addErrorMessage("Failed to continue after resource connection. Please send a follow-up message.")
      setLoading(false)
      setStreamStatus("idle")
    }
  }

  const sendTriggerApprovedMessage = async (triggerName: string, action: "create" | "update") => {
    const threadId = selectedThreadId()
    if (!threadId || loading() || !props.currentConfig) return

    const verb = action === "create" ? "created" : "updated"
    const message = `I've ${verb} the trigger: "${triggerName}". Please continue with the agent configuration.`
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMessage: CopilotMessage = {
      id: optimisticId,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setLoading(true)
    setStreamStatus("connecting")
    scrollToBottom()

    try {
      const res = await api.api.agents[":id"].copilot.messages.$post({
        param: { id: props.agentId },
        json: {
          message,
          threadId,
          currentConfig: props.currentConfig,
          pendingProposalConfig: pendingProposal()?.config ?? undefined,
          environmentId: props.environmentId ?? undefined,
          model: selectedModel() ?? undefined,
        },
      })

      if (!res.ok) throw new Error("Failed to send continuation message")
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      addErrorMessage("Failed to continue after trigger approval. Please send a follow-up message.")
      setLoading(false)
      setStreamStatus("idle")
    }
  }

  const handleQuestionSubmit = async (answers: CopilotQuestionResult[]) => {
    const question = questionRequest()
    const threadId = selectedThreadId()
    if (!question || !threadId || questionSubmitting() || !props.currentConfig) return

    setQuestionSubmitting(true)
    setLoading(true)
    setStreamStatus("connecting")

    try {
      const res = await api.api.agents[":id"].copilot.widgets.submit.$post({
        param: { id: props.agentId },
        json: {
          threadId,
          toolCallId: question.toolCallId,
          answers,
          currentConfig: props.currentConfig,
          pendingProposalConfig: pendingProposal()?.config ?? undefined,
          environmentId: props.environmentId ?? undefined,
          model: selectedModel() ?? undefined,
        },
      })

      if (!res.ok) throw new Error("Failed to submit question response")
      setQuestionRequest(null)
    } catch {
      addErrorMessage("Failed to submit question response. Please try again.")
      setLoading(false)
      setStreamStatus("idle")
    } finally {
      setQuestionSubmitting(false)
    }
  }

  if (props.approveRef) props.approveRef.current = handleApprove
  if (props.rejectRef) props.rejectRef.current = handleReject

  return (
    <div class="flex h-full flex-col">
      <Header
        threads={threads()}
        selectedThreadId={selectedThreadId()}
        historyLoading={historyLoading()}
        onThreadSelect={setSelectedThreadId}
        onCreateThread={createThread}
        onDeleteThread={handleDeleteThread}
      />

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={historyLoading()}>
          <div class="flex h-full items-center justify-center">
            <Spinner size="sm" />
          </div>
        </Show>

        <Show when={!historyLoading()}>
          <Show
            when={messages().length > 0 || selectedThreadId()}
            fallback={
              <div class="flex h-full flex-col items-center justify-center px-4 text-center">
                <Sparkle class="h-8 w-8 text-accent/30 mb-3" weight="duotone" />
                <p class="text-xs text-text-muted mb-1">Agent Configuration Copilot</p>
                <p class="text-2xs text-text-muted/70 max-w-[200px] mb-3">
                  Describe what you want to build and I'll help configure your agent
                </p>
                <Button variant="outline" size="xs" onClick={createThread}>
                  <Plus class="h-3 w-3" />
                  Start a conversation
                </Button>
              </div>
            }
          >
            <div class="space-y-3 p-3">
              <For each={messages()}>{(message) => <MessageItem message={message} toolLogs={toolLogs()} />}</For>

              <StreamingMessage
                streamStatus={streamStatus}
                reasoningText={reasoningText}
                streamingText={streamingText}
                toolCalls={toolCalls}
                reasoningExpanded={reasoningExpanded}
                toolsExpanded={toolsExpanded}
                onReasoningToggle={() => setReasoningExpanded((prev) => !prev)}
                onToolsToggle={() => setToolsExpanded((prev) => !prev)}
              />

              <Show when={questionRequest()}>
                {(question) => (
                  <QuestionForm
                    questions={question().questions}
                    onSubmit={handleQuestionSubmit}
                    submitting={questionSubmitting()}
                  />
                )}
              </Show>

              <div ref={messagesEndRef} />
            </div>
          </Show>
        </Show>
      </div>

      <InputForm
        value={input()}
        loading={loading()}
        models={availableModels()}
        selectedModel={selectedModel()}
        onInput={setInput}
        onSend={handleSend}
        onModelChange={setSelectedModel}
      />
    </div>
  )
}
