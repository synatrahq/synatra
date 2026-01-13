import { createSignal, createEffect, on, onCleanup, Show, createMemo } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useParams, useNavigate, useSearchParams } from "@solidjs/router"
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/solid-query"
import { api, apiBaseURL, OrgGuard, setPendingCount, user, memberRole, activeOrg } from "../../app"
import { IconButton, Input } from "../../ui"
import { Shell } from "../../components"
import { ThreadList, type ThreadListItem } from "./thread-list"
import { ThreadDetail } from "./thread-detail"
import { ComposeModal } from "./compose-modal"
import { InboxSidebar } from "./inbox-sidebar"
import { AgentInfoPanel } from "./agent-info-panel"
import { ThreadDeleteModal } from "./thread-delete-modal"
import { ChannelCreateModal } from "./channel-create-modal"
import { ThreadListHeader } from "./thread-list-header"
import type {
  ChannelMembers,
  ChannelAgents,
  Thread,
  ThreadMessage,
  ThreadRun,
  ThreadOutputItem,
  ThreadHumanRequest,
  ThreadHumanResponse,
} from "../../app/api"
import type { ThreadStatus } from "@synatra/core/types"
import { ChannelPanel } from "./channel-panel"
import { MagnifyingGlass, ArrowClockwise } from "phosphor-solid-js"
import { threadStreamEventSchemas, type ThreadStreamEventType } from "@synatra/core/thread-events"

const noop = () => {}

function PageSkeleton() {
  const [searchParams] = useSearchParams<{ thread?: string }>()
  return (
    <Shell>
      <InboxSidebar
        statusFilter="all"
        agentFilter={null}
        channelFilter={null}
        onStatusChange={noop}
        onAgentChange={noop}
        onChannelChange={noop}
        statusCounts={{}}
        archivedCount={0}
        agents={[]}
        channels={[]}
        agentsExpanded={true}
        channelsExpanded={true}
        onAgentsExpandedChange={noop}
        onChannelsExpandedChange={noop}
        onNewThread={noop}
        onNewChannel={noop}
      />
      <div class="flex h-full w-1/3 min-w-[300px] max-w-[500px] shrink-0 flex-col border-r border-border bg-surface-elevated">
        <ThreadListHeader type="status" statusFilter="all" />
        <ThreadList threads={[]} loading={true} />
      </div>
      <ThreadDetail thread={null} loading={!!searchParams.thread} />
    </Shell>
  )
}

type ChannelSettingsData = {
  id: string
  name: string
  slug: string
  description: string | null
  isArchived: boolean
}

type StatusFilter = "all" | "waiting_human" | "running" | "completed" | "failed" | "rejected" | "skipped" | "archive"

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

type ThreadEventType = ThreadStreamEventType

type ThreadEventPayload<T> = {
  seq: number
  threadId: string
  type: ThreadEventType
  data: T
  updatedAt: string
}

const deriveLastSeq = (thread?: Thread | null, fallback?: number | null) => {
  if (typeof fallback === "number") return fallback
  if (!thread) return null
  if (typeof thread.seq === "number") return thread.seq
  return null
}

const upsertMessage = (messages: ThreadMessage[], message: ThreadMessage) => {
  const next = [...messages]
  const existing = next.findIndex((m) => m.id === message.id)
  if (existing >= 0) {
    next[existing] = message
    return next
  }
  const optimistic = next.findIndex(
    (m) => m.id.startsWith("optimistic-") && m.type === message.type && m.content === message.content,
  )
  if (optimistic >= 0) {
    next[optimistic] = message
    return next
  }
  next.push(message)
  next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return next
}

const upsertRun = (runs: ThreadRun[], run: ThreadRun) => {
  const next = [...runs]
  const existing = next.findIndex((r) => r.id === run.id)
  if (existing >= 0) {
    next[existing] = run
    return next
  }
  next.push(run)
  next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return next
}

const upsertOutputItem = (items: ThreadOutputItem[], item: ThreadOutputItem) => {
  const next = [...items]
  const existing = next.findIndex((i) => i.id === item.id)
  if (existing >= 0) {
    next[existing] = item
    return next
  }
  next.push(item)
  next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return next
}

const upsertHumanRequest = (requests: ThreadHumanRequest[], request: ThreadHumanRequest) => {
  const next = [...requests]
  const existing = next.findIndex((r) => r.id === request.id)
  if (existing >= 0) {
    next[existing] = request
    return next
  }
  next.push(request)
  next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return next
}

const applyStatusPatch = (
  thread: Thread,
  data: { status: ThreadStatus; result?: Thread["result"]; error?: string; updatedAt?: string },
) => ({
  ...thread,
  status: data.status,
  updatedAt: data.updatedAt ?? thread.updatedAt,
  result: "result" in data ? (data.result ?? null) : thread.result,
  error: "error" in data ? (data.error ?? null) : thread.error,
})

export default function InboxPage() {
  const params = useParams<{ channelSlug?: string }>()
  const [searchParams, setSearchParams] = useSearchParams<{ status?: string; agent?: string; thread?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedThread, setSelectedThread] = createSignal<Thread | null>(null)
  const [threadLoading, setThreadLoading] = createSignal(false)
  const [responding, setResponding] = createSignal(false)
  const [replying, setReplying] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [refreshing, setRefreshing] = createSignal(false)
  const [composeOpen, setComposeOpen] = createSignal(false)
  const [agentsExpanded, setAgentsExpanded] = createSignal(true)
  const [channelsExpanded, setChannelsExpanded] = createSignal(true)
  const [agentPanelId, setAgentPanelId] = createSignal<string | null>(null)
  const [lastSeq, setLastSeq] = createSignal<number | null>(null)
  const [pendingMessage, setPendingMessage] = createSignal<{ threadId: string; message: string } | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false)
  const [deletingThread, setDeletingThread] = createSignal<ThreadListItem | null>(null)
  const [deleting, setDeleting] = createSignal(false)
  const [channelCreateOpen, setChannelCreateOpen] = createSignal(false)
  const [creatingChannel, setCreatingChannel] = createSignal(false)
  const [channelPanelOpen, setChannelPanelOpen] = createSignal(false)
  const [savingChannel, setSavingChannel] = createSignal(false)

  const channelsQuery = useQuery(() => ({
    queryKey: ["inbox", "channels"],
    queryFn: async () => {
      const res = await api.api.channels.$get({ query: {} })
      if (!res.ok) throw new Error("Failed to fetch channels")
      const data = (await res.json()) as Array<{
        id: string
        name: string
        slug: string
        icon: string | null
        iconColor: string | null
        isDefault: boolean
      }>
      return data
        .map((c) => ({ ...c, count: 0 }))
        .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name)) as ChannelItem[]
    },
  }))

  const countsQuery = useQuery(() => ({
    queryKey: ["inbox", "counts"],
    queryFn: async () => {
      const res = await api.api.threads.counts.$get()
      if (!res.ok) throw new Error("Failed to fetch counts")
      const data = await res.json()
      const pending = data.byStatus.waiting_human ?? 0
      setPendingCount(pending)
      return {
        byStatus: data.byStatus as Record<string, number>,
        archivedCount: data.archivedCount as number,
        byAgent: data.byAgent.sort((a: AgentItem, b: AgentItem) => b.count - a.count) as AgentItem[],
        byChannel: data.byChannel as Array<{ id: string; count: number }>,
      }
    },
  }))

  const channels = () => {
    const base = channelsQuery.data ?? []
    const countMap = new Map(countsQuery.data?.byChannel.map((c) => [c.id, c.count]) ?? [])
    return base.map((ch) => ({ ...ch, count: countMap.get(ch.id) ?? 0 }))
  }
  const agents = () => countsQuery.data?.byAgent ?? []
  const statusCounts = () => countsQuery.data?.byStatus ?? {}
  const archivedCount = () => countsQuery.data?.archivedCount ?? 0

  const selectedChannelId = createMemo(() => {
    const slug = params.channelSlug
    if (!slug) return null
    const channel = channels().find((c) => c.slug === slug)
    return channel?.id ?? null
  })

  const channelMembersQuery = useQuery(() => {
    const channelId = selectedChannelId()
    return {
      queryKey: ["inbox", "channel", channelId ?? "", "members"],
      queryFn: async (): Promise<ChannelMembers> => {
        if (!channelId) return []
        const res = await api.api.channels[":channelId"].members.$get({ param: { channelId } })
        if (!res.ok) throw new Error("Failed to fetch channel members")
        return res.json()
      },
      enabled: !!channelId,
    }
  })

  const channelAgentsQuery = useQuery(() => {
    const channelId = selectedChannelId()
    return {
      queryKey: ["inbox", "channel", channelId ?? "", "agents"],
      queryFn: async (): Promise<ChannelAgents> => {
        if (!channelId) return []
        const res = await api.api.channels[":channelId"].agents.$get({ param: { channelId } })
        if (!res.ok) throw new Error("Failed to fetch channel agents")
        return res.json()
      },
      enabled: !!channelId,
    }
  })

  const channelDataQuery = useQuery(() => {
    const channelId = selectedChannelId()
    return {
      queryKey: ["inbox", "channel", channelId ?? "", "data"],
      queryFn: async () => {
        if (!channelId) return null
        const res = await api.api.channels[":id"].$get({ param: { id: channelId } })
        if (!res.ok) throw new Error("Failed to fetch channel data")
        return res.json() as Promise<ChannelSettingsData>
      },
      enabled: !!channelId,
    }
  })

  const channelMembers = () => channelMembersQuery.data ?? []
  const channelAgents = () => channelAgentsQuery.data ?? []
  const selectedChannelData = () => channelDataQuery.data ?? null

  const statusFilter = (): StatusFilter => {
    const s = searchParams.status
    if (
      s === "waiting_human" ||
      s === "running" ||
      s === "completed" ||
      s === "failed" ||
      s === "rejected" ||
      s === "skipped" ||
      s === "archive"
    ) {
      return s
    }
    return "all"
  }

  const channelFilter = () => {
    const slug = params.channelSlug
    if (!slug) return null
    const channel = channels().find((c) => c.slug === slug)
    return channel?.id ?? null
  }

  const agentFilter = () => {
    const slug = searchParams.agent
    if (!slug) return null
    const agent = agents().find((a) => a.slug === slug)
    return agent?.id ?? null
  }

  const threadsQuery = useInfiniteQuery(() => ({
    queryKey: ["inbox", "threads", statusFilter(), channelFilter(), agentFilter()],
    queryFn: async ({ pageParam }) => {
      const query: {
        status?: "running" | "waiting_human" | "completed" | "failed" | "cancelled" | "rejected"
        agentId?: string
        channelId?: string
        archived?: string
        cursor?: string
        limit?: string
      } = { limit: "30" }
      const filter = statusFilter()
      query.archived = filter === "archive" ? "true" : "false"
      if (filter !== "all" && filter !== "archive") {
        query.status = filter as typeof query.status
      }
      const agent = agentFilter()
      if (agent) {
        query.agentId = agent
      }
      const channel = channelFilter()
      if (channel) {
        query.channelId = channel
      }
      if (pageParam) {
        query.cursor = pageParam
      }
      const res = await api.api.threads.$get({ query })
      if (!res.ok) throw new Error("Failed to fetch threads")
      return res.json()
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  }))

  const threads = () => threadsQuery.data?.pages.flatMap((p) => p.items) ?? []
  const hasMoreThreads = () => threadsQuery.hasNextPage

  let eventSource: EventSource | null = null
  let retryTimer: number | null = null
  let pollingTimer: number | null = null
  let reconnectAttempts = 0

  const closeStream = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  const stopPolling = () => {
    if (!pollingTimer) return
    clearInterval(pollingTimer)
    pollingTimer = null
  }

  const startPolling = (threadId: string) => {
    stopPolling()
    pollingTimer = window.setInterval(() => {
      fetchThreadDetail(threadId, true)
    }, 10000)
  }

  const safeParse = <T,>(raw: string): T | null => {
    try {
      return JSON.parse(raw) as T
    } catch (e) {
      console.error("Failed to parse stream event", e)
      return null
    }
  }

  const backoffDelays = [100, 500, 2000]

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

  const connectStream = (threadId: string) => {
    closeStream()
    clearRetry()

    const url = new URL(`/api/threads/${threadId}/stream`, apiBaseURL || window.location.origin)
    const seq = lastSeq()
    if (seq !== null) {
      url.searchParams.set("fromSeq", String(seq))
    }

    const source = new EventSource(url.toString(), { withCredentials: true })
    eventSource = source

    source.onopen = () => {
      reconnectAttempts = 0
      stopPolling()
    }

    source.onerror = () => handleStreamError(threadId)

    source.addEventListener("init", (event) => {
      const payload = safeParse<{ thread: Thread; lastSeq?: number }>(event.data)
      if (!payload) return
      let thread = payload.thread
      const pending = pendingMessage()
      if (pending && pending.threadId === threadId && thread.messages.length === 0) {
        thread = {
          ...thread,
          messages: [
            {
              id: `optimistic-${Date.now()}`,
              threadId,
              runId: null,
              type: "user",
              content: pending.message,
              toolCall: null,
              toolResult: null,
              createdAt: new Date().toISOString(),
            },
          ],
        }
      }
      setSelectedThread(thread)
      setLastSeq(deriveLastSeq(thread, payload.lastSeq ?? null))
    })

    source.addEventListener("message.created", (event) => {
      const payload = safeParse<ThreadEventPayload<{ message: ThreadMessage }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["message.created"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      const pending = pendingMessage()
      if (pending && pending.threadId === threadId) {
        setPendingMessage(null)
      }
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, messages: upsertMessage(prev.messages, payload.data.message) }
      })
    })

    source.addEventListener("thread.status_changed", (event) => {
      const payload = safeParse<
        ThreadEventPayload<{ status: ThreadStatus; result?: Thread["result"]; error?: string; updatedAt?: string }>
      >(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["thread.status_changed"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return applyStatusPatch(prev, payload.data)
      })
      updateThreadInCache(threadId, { status: payload.data.status })
    })

    source.addEventListener("resync_required", () => {
      setLastSeq(null)
      fetchThreadDetail(threadId)
    })

    source.addEventListener("run.created", (event) => {
      const payload = safeParse<ThreadEventPayload<{ run: ThreadRun }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["run.created"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, runs: upsertRun(prev.runs, payload.data.run) }
      })
    })

    source.addEventListener("run.updated", (event) => {
      const payload = safeParse<ThreadEventPayload<{ run: ThreadRun }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["run.updated"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, runs: upsertRun(prev.runs, payload.data.run) }
      })
    })

    source.addEventListener("run.completed", (event) => {
      const payload = safeParse<ThreadEventPayload<{ run: ThreadRun }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["run.completed"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, runs: upsertRun(prev.runs, payload.data.run) }
      })
    })

    source.addEventListener("run.failed", (event) => {
      const payload = safeParse<ThreadEventPayload<{ run: ThreadRun }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["run.failed"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, runs: upsertRun(prev.runs, payload.data.run) }
      })
    })

    source.addEventListener("run.cancelled", (event) => {
      const payload = safeParse<ThreadEventPayload<{ run: ThreadRun }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["run.cancelled"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, runs: upsertRun(prev.runs, payload.data.run) }
      })
    })

    source.addEventListener("run.rejected", (event) => {
      const payload = safeParse<ThreadEventPayload<{ run: ThreadRun }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["run.rejected"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, runs: upsertRun(prev.runs, payload.data.run) }
      })
    })

    source.addEventListener("output_item.created", (event) => {
      const payload = safeParse<ThreadEventPayload<{ outputItem: ThreadOutputItem }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["output_item.created"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, outputItems: upsertOutputItem(prev.outputItems, payload.data.outputItem) }
      })
    })

    source.addEventListener("human_request.created", (event) => {
      const payload = safeParse<ThreadEventPayload<{ humanRequest: ThreadHumanRequest }>>(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["human_request.created"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return { ...prev, humanRequests: upsertHumanRequest(prev.humanRequests, payload.data.humanRequest) }
      })
    })

    source.addEventListener("human_request.resolved", (event) => {
      const payload = safeParse<
        ThreadEventPayload<{ humanRequest: ThreadHumanRequest; response: ThreadHumanResponse }>
      >(event.data)
      if (!payload || payload.threadId !== threadId) return
      const validator = threadStreamEventSchemas["human_request.resolved"]
      if (validator && !validator.safeParse(payload.data).success) return
      setLastSeq((prev) => Math.max(prev ?? 0, payload.seq))
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        const responses = prev.humanResponses.filter((r) => r.requestId !== payload.data.response.requestId)
        return {
          ...prev,
          humanRequests: upsertHumanRequest(prev.humanRequests, payload.data.humanRequest),
          humanResponses: [...responses, payload.data.response],
        }
      })
    })
  }

  const invalidateCounts = () => queryClient.invalidateQueries({ queryKey: ["inbox", "counts"] })
  const invalidateChannels = () => queryClient.invalidateQueries({ queryKey: ["inbox", "channels"] })
  const invalidateChannelMembers = () =>
    queryClient.invalidateQueries({ queryKey: ["inbox", "channel", selectedChannelId(), "members"] })
  const invalidateChannelAgents = () =>
    queryClient.invalidateQueries({ queryKey: ["inbox", "channel", selectedChannelId(), "agents"] })
  const invalidateChannelData = () =>
    queryClient.invalidateQueries({ queryKey: ["inbox", "channel", selectedChannelId(), "data"] })
  const invalidateThreads = () => queryClient.invalidateQueries({ queryKey: ["inbox", "threads"] })

  const updateThreadInCache = (threadId: string, updates: Partial<ThreadListItem>) => {
    queryClient.setQueryData(
      ["inbox", "threads", statusFilter(), channelFilter(), agentFilter()],
      (
        old:
          | { pages: Array<{ items: ThreadListItem[]; nextCursor: string | null }>; pageParams: unknown[] }
          | undefined,
      ) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((t) => (t.id === threadId ? { ...t, ...updates } : t)),
          })),
        }
      },
    )
  }

  const removeThreadFromCache = (threadId: string) => {
    queryClient.setQueryData(
      ["inbox", "threads", statusFilter(), channelFilter(), agentFilter()],
      (
        old:
          | { pages: Array<{ items: ThreadListItem[]; nextCursor: string | null }>; pageParams: unknown[] }
          | undefined,
      ) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((t) => t.id !== threadId),
          })),
        }
      },
    )
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await queryClient.refetchQueries({ queryKey: ["inbox", "threads", statusFilter(), channelFilter(), agentFilter()] })
    invalidateCounts()
    setRefreshing(false)
  }

  const handleThreadSent = (threadId: string, channelSlug: string, message: string | null) => {
    if (message) {
      setPendingMessage({ threadId, message })
    }
    invalidateThreads()
    invalidateCounts()
    navigate(`/inbox/${channelSlug}?thread=${threadId}`)
  }

  const fetchThreadDetail = async (id: string, silent = false) => {
    const threadItem = threads().find((t) => t.id === id)
    const current = selectedThread()
    const switching = !current || current.id !== id

    if (!silent && switching) {
      setThreadLoading(true)
    }

    if (!silent && threadItem && switching) {
      const channel = channels().find((c) => c.slug === threadItem.channelSlug)
      const pending = pendingMessage()
      const optimisticMessages: ThreadMessage[] =
        pending && pending.threadId === id
          ? [
              {
                id: `optimistic-${Date.now()}`,
                threadId: id,
                runId: null,
                type: "user",
                content: pending.message,
                toolCall: null,
                toolResult: null,
                createdAt: new Date().toISOString(),
              },
            ]
          : []
      setSelectedThread({
        id: threadItem.id,
        agentId: threadItem.agentId,
        triggerId: threadItem.triggerId,
        channelId: channel?.id ?? "",
        subject: threadItem.subject,
        status: threadItem.status,
        payload: {},
        result: null,
        error: null,
        skipReason: null,
        createdBy: null,
        createdAt: threadItem.createdAt,
        updatedAt: threadItem.updatedAt,
        seq: 0,
        agent: threadItem.agentName
          ? {
              id: threadItem.agentId,
              name: threadItem.agentName,
              icon: threadItem.agentIcon ?? "",
              iconColor: threadItem.agentIconColor ?? "",
              runtimeConfig: null,
            }
          : null,
        trigger: threadItem.triggerSlug ? { id: threadItem.triggerId ?? "", slug: threadItem.triggerSlug } : null,
        messages: optimisticMessages,
        runs: [],
        outputItems: [],
        humanRequests: [],
        humanResponses: [],
      } as unknown as Thread)
    }

    try {
      const res = await api.api.threads[":id"].$get({ param: { id } })
      if (res.ok) {
        let thread = await res.json()
        const pending = pendingMessage()
        if (pending && pending.threadId === id && thread.messages.length === 0) {
          thread = {
            ...thread,
            messages: [
              {
                id: `optimistic-${Date.now()}`,
                threadId: id,
                runId: null,
                type: "user",
                content: pending.message,
                toolCall: null,
                toolResult: null,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        }
        setSelectedThread(thread)
        setLastSeq(deriveLastSeq(thread, null))
      }
    } catch (e) {
      console.error("Failed to fetch thread detail", e)
    } finally {
      if (searchParams.thread === id) {
        setThreadLoading(false)
      }
    }
  }

  const handleHumanRequestRespond = async (
    requestId: string,
    action: "respond" | "cancel" | "skip",
    data?: unknown,
  ) => {
    const threadId = searchParams.thread
    if (!threadId) return

    const isCancel = action === "cancel"
    const isSkip = action === "skip"
    const newStatus: "responded" | "cancelled" | "skipped" = isCancel ? "cancelled" : isSkip ? "skipped" : "responded"

    setSelectedThread((prev) => {
      if (!prev || prev.id !== threadId) return prev
      return {
        ...prev,
        status: isCancel ? prev.status : "running",
        humanRequests: prev.humanRequests.map((r) => {
          if (r.id === requestId) {
            return {
              ...r,
              status: newStatus,
              respondedAt: new Date().toISOString(),
            }
          }
          return r
        }),
      }
    })

    setResponding(true)
    try {
      const payload = {
        status: newStatus,
        data: isCancel ? undefined : data,
      }
      const res = await api.api.threads[":threadId"]["human-requests"][":requestId"].respond.$post({
        param: { threadId, requestId },
        json: payload,
      })
      if (!res.ok && threadId) {
        await fetchThreadDetail(threadId)
      }
      invalidateThreads()
      invalidateCounts()
    } catch (e) {
      console.error("Failed to respond to human request", e)
      if (threadId) await fetchThreadDetail(threadId)
    } finally {
      setResponding(false)
    }
  }

  const handleReply = async (message: string) => {
    const threadId = searchParams.thread
    if (!threadId) return

    const optimisticMessage: ThreadMessage = {
      id: `optimistic-${Date.now()}`,
      threadId,
      runId: null,
      type: "user",
      content: message,
      toolCall: null,
      toolResult: null,
      createdAt: new Date().toISOString(),
    }

    setSelectedThread((prev) => {
      if (!prev || prev.id !== threadId) return prev
      return {
        ...prev,
        status: "running",
        messages: [...prev.messages, optimisticMessage],
      }
    })

    setReplying(true)
    try {
      const res = await api.api.threads[":id"].reply.$post({
        param: { id: threadId },
        json: { message },
      })
      if (!res.ok) {
        setSelectedThread((prev) => {
          if (!prev || prev.id !== threadId) return prev
          return {
            ...prev,
            messages: prev.messages.filter((m) => m.id !== optimisticMessage.id),
          }
        })
      }
      invalidateThreads()
      invalidateCounts()
    } catch (e) {
      console.error("Failed to reply", e)
      setSelectedThread((prev) => {
        if (!prev || prev.id !== threadId) return prev
        return {
          ...prev,
          messages: prev.messages.filter((m) => m.id !== optimisticMessage.id),
        }
      })
    } finally {
      setReplying(false)
    }
  }

  const handleDelete = (id: string) => {
    const thread = threads().find((t) => t.id === id)
    if (!thread) return
    setDeletingThread(thread)
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    const thread = deletingThread()
    if (!thread) return
    setDeleting(true)
    try {
      const res = await api.api.threads[":id"].$delete({ param: { id: thread.id } })
      if (!res.ok) return
      setDeleteModalOpen(false)
      setDeletingThread(null)
      removeThreadFromCache(thread.id)
      if (searchParams.thread === thread.id) {
        setSearchParams({ thread: undefined })
      }
      invalidateCounts()
    } catch (e) {
      console.error("Failed to delete thread", e)
    } finally {
      setDeleting(false)
    }
  }

  const handleArchive = async (id: string) => {
    try {
      const res = await api.api.threads[":id"].archive.$post({ param: { id } })
      if (!res.ok) return
      removeThreadFromCache(id)
      if (searchParams.thread === id) {
        setSearchParams({ thread: undefined })
      }
      invalidateCounts()
    } catch (e) {
      console.error("Failed to archive thread", e)
    }
  }

  const handleUnarchive = async (id: string) => {
    try {
      const res = await api.api.threads[":id"].unarchive.$post({ param: { id } })
      if (!res.ok) return
      removeThreadFromCache(id)
      if (searchParams.thread === id) {
        setSearchParams({ thread: undefined })
      }
      invalidateCounts()
    } catch (e) {
      console.error("Failed to unarchive thread", e)
    }
  }

  const handleCreateChannel = async (data: { name: string; slug?: string }) => {
    setCreatingChannel(true)
    try {
      const res = await api.api.channels.$post({ json: data })
      if (res.ok) {
        setChannelCreateOpen(false)
        invalidateChannels()
      } else {
        const err = await res.json().catch(() => ({ message: "Failed to create channel" }))
        throw new Error((err as { message?: string }).message || "Failed to create channel")
      }
    } finally {
      setCreatingChannel(false)
    }
  }

  const handleAddMembers = async (memberIds: string[]) => {
    const channelId = channelFilter()
    if (!channelId) return
    const res = await api.api.channels[":channelId"].members.$post({
      param: { channelId },
      json: { memberIds },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to add members" }))
      throw new Error((err as { message?: string }).message || "Failed to add members")
    }
    invalidateChannelMembers()
  }

  const handleRemoveMember = async (memberId: string) => {
    const channelId = channelFilter()
    if (!channelId) return
    const res = await api.api.channels[":channelId"].members[":memberId"].$delete({
      param: { channelId, memberId },
    })
    if (!res.ok) return
    invalidateChannelMembers()
  }

  const handleUpdateMemberRole = async (memberId: string, role: "owner" | "member") => {
    const channelId = channelFilter()
    if (!channelId) return
    const res = await api.api.channels[":channelId"].members[":memberId"].$patch({
      param: { channelId, memberId },
      json: { role },
    })
    if (!res.ok) return
    invalidateChannelMembers()
  }

  const handleAddAgents = async (agentIds: string[]) => {
    const channelId = channelFilter()
    if (!channelId) return
    const res = await api.api.channels[":channelId"].agents.$post({
      param: { channelId },
      json: { agentIds },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to add agents" }))
      throw new Error((err as { message?: string }).message || "Failed to add agents")
    }
    invalidateChannelAgents()
  }

  const handleRemoveAgent = async (agentId: string) => {
    const channelId = channelFilter()
    if (!channelId) return
    const res = await api.api.channels[":channelId"].agents[":agentId"].$delete({
      param: { channelId, agentId },
    })
    if (!res.ok) return
    invalidateChannelAgents()
  }

  const handleSaveChannelSettings = async (data: { name: string; description?: string }) => {
    const channelId = channelFilter()
    if (!channelId) return
    setSavingChannel(true)
    try {
      const res = await api.api.channels[":id"].$patch({
        param: { id: channelId },
        json: data,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to save channel" }))
        throw new Error((err as { message?: string }).message || "Failed to save channel")
      }
      invalidateChannels()
      invalidateChannelData()
    } finally {
      setSavingChannel(false)
    }
  }

  const handleArchiveChannel = async () => {
    const channelId = channelFilter()
    if (!channelId) return
    const res = await api.api.channels[":id"].archive.$post({ param: { id: channelId } })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to archive channel" }))
      throw new Error((err as { message?: string }).message || "Failed to archive channel")
    }
    navigate("/inbox")
    invalidateChannels()
  }

  const handleUnarchiveChannel = async () => {
    const channelId = channelFilter()
    if (!channelId) return
    const res = await api.api.channels[":id"].unarchive.$post({ param: { id: channelId } })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to unarchive channel" }))
      throw new Error((err as { message?: string }).message || "Failed to unarchive channel")
    }
    invalidateChannels()
    invalidateChannelData()
  }

  const selectedChannel = () => channels().find((c) => c.slug === params.channelSlug)
  const selectedAgent = () => agents().find((a) => a.slug === searchParams.agent)

  const handleStatusChange = (status: StatusFilter) => {
    const url = status === "all" ? "/inbox" : `/inbox?status=${status}`
    navigate(url)
  }

  const handleChannelChange = (channelId: string | null) => {
    if (!channelId) {
      if (params.channelSlug) {
        navigate("/inbox")
      }
      return
    }
    const channel = channels().find((c) => c.id === channelId)
    if (channel) {
      navigate(`/inbox/${channel.slug}`)
    }
  }

  const handleAgentChange = (agentId: string | null) => {
    if (!agentId) {
      if (searchParams.agent) {
        navigate("/inbox")
      }
      return
    }
    const agent = agents().find((a) => a.id === agentId)
    if (agent?.slug) {
      navigate(`/inbox?agent=${agent.slug}`)
    }
  }
  const currentUserId = () => user()?.id ?? ""
  const isChannelOwner = () => {
    const role = memberRole()
    if (role === "owner" || role === "admin") return true
    const members = channelMembers()
    const userId = currentUserId()
    const member = members.find((m) => m.user.id === userId)
    return member?.role === "owner"
  }

  const filteredThreads = () => {
    const query = searchQuery().toLowerCase()
    if (!query) return threads()
    return threads().filter(
      (t) => t.subject.toLowerCase().includes(query) || t.agentName?.toLowerCase().includes(query),
    )
  }

  createEffect(
    on(
      () => searchParams.thread,
      (threadId) => {
        closeStream()
        clearRetry()
        stopPolling()
        setLastSeq(null)
        if (!threadId) {
          setSelectedThread(null)
          setThreadLoading(false)
          return
        }
        void fetchThreadDetail(threadId).then(() => connectStream(threadId))
      },
    ),
  )

  createEffect(
    on(
      () => params.channelSlug,
      (slug) => {
        if (!slug) {
          setChannelPanelOpen(false)
        }
      },
    ),
  )

  onCleanup(() => {
    closeStream()
    clearRetry()
    stopPolling()
  })

  return (
    <>
      <Title>{`Inbox | ${activeOrg()?.name ?? "Synatra"}`}</Title>
      <Meta
        name="description"
        content="Chat with AI agents like colleagues. They handle the work and ask when they need you."
      />
      <OrgGuard fallback={<PageSkeleton />}>
        <Shell>
          <InboxSidebar
            statusFilter={statusFilter()}
            agentFilter={agentFilter()}
            channelFilter={channelFilter()}
            onStatusChange={handleStatusChange}
            onAgentChange={handleAgentChange}
            onChannelChange={handleChannelChange}
            statusCounts={statusCounts()}
            archivedCount={archivedCount()}
            agents={agents()}
            channels={channels()}
            agentsExpanded={agentsExpanded()}
            channelsExpanded={channelsExpanded()}
            onAgentsExpandedChange={setAgentsExpanded}
            onChannelsExpandedChange={setChannelsExpanded}
            onNewThread={() => setComposeOpen(true)}
            onNewChannel={() => setChannelCreateOpen(true)}
          />

          <div class="flex h-full w-1/3 min-w-[300px] max-w-[500px] shrink-0 flex-col border-r border-border bg-surface-elevated">
            <Show
              when={channelFilter()}
              fallback={
                <Show when={agentFilter()} fallback={<ThreadListHeader type="status" statusFilter={statusFilter()} />}>
                  <ThreadListHeader
                    type="agent"
                    agentName={selectedAgent()?.name}
                    agentIcon={selectedAgent()?.icon}
                    agentIconColor={selectedAgent()?.iconColor}
                  />
                </Show>
              }
            >
              <ThreadListHeader
                type="channel"
                channelName={selectedChannel()?.name}
                memberCount={channelMembers().length}
                agentCount={channelAgents().length}
                isChannelOwner={isChannelOwner()}
                onChannelClick={() => setChannelPanelOpen(true)}
              />
            </Show>

            <div class="flex items-center gap-2 px-3.5 py-1.5">
              <div class="relative flex-1">
                <MagnifyingGlass class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted/60" />
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  class="w-full pl-7"
                />
              </div>
              <IconButton variant="outline" size="md" onClick={handleRefresh} disabled={refreshing()}>
                <ArrowClockwise class="h-3.5 w-3.5" classList={{ "animate-spin": refreshing() }} />
              </IconButton>
            </div>

            <ThreadList
              threads={filteredThreads()}
              selectedId={searchParams.thread}
              loading={threadsQuery.isPending}
              loadingMore={threadsQuery.isFetchingNextPage}
              hasMore={hasMoreThreads() && !searchQuery()}
              isArchiveView={statusFilter() === "archive"}
              onLoadMore={() => threadsQuery.fetchNextPage()}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
            />
          </div>

          <ThreadDetail
            thread={selectedThread()}
            loading={threadLoading()}
            isChannelOwner={isChannelOwner()}
            onHumanRequestRespond={handleHumanRequestRespond}
            onReply={handleReply}
            onAgentClick={(agentId) => setAgentPanelId(agentId)}
            responding={responding()}
            replying={replying()}
          />

          <Show when={agentPanelId()}>
            {(id) => <AgentInfoPanel agentId={id()} onClose={() => setAgentPanelId(null)} />}
          </Show>

          <ComposeModal
            open={composeOpen()}
            defaultChannelId={channelFilter()}
            onClose={() => setComposeOpen(false)}
            onSent={handleThreadSent}
          />
          <ThreadDeleteModal
            open={deleteModalOpen()}
            threadSubject={deletingThread()?.subject ?? ""}
            onClose={() => {
              setDeleteModalOpen(false)
              setDeletingThread(null)
            }}
            onConfirm={handleDeleteConfirm}
            deleting={deleting()}
          />
          <ChannelCreateModal
            open={channelCreateOpen()}
            onClose={() => setChannelCreateOpen(false)}
            onSave={handleCreateChannel}
            saving={creatingChannel()}
          />

          <Show when={selectedChannelData()}>
            {(channel) => (
              <ChannelPanel
                open={channelPanelOpen()}
                channelId={channel().id}
                channelName={channel().name}
                channelSlug={channel().slug}
                channelDescription={channel().description}
                isArchived={channel().isArchived}
                members={channelMembers()}
                agents={channelAgents()}
                currentUserId={currentUserId()}
                isOwner={isChannelOwner()}
                membersLoading={channelMembersQuery.isPending}
                agentsLoading={channelAgentsQuery.isPending}
                onClose={() => setChannelPanelOpen(false)}
                onAddMembers={handleAddMembers}
                onRemoveMember={handleRemoveMember}
                onUpdateRole={handleUpdateMemberRole}
                onAddAgents={handleAddAgents}
                onRemoveAgent={handleRemoveAgent}
                onSave={handleSaveChannelSettings}
                onArchive={handleArchiveChannel}
                onUnarchive={handleUnarchiveChannel}
                saving={savingChannel()}
              />
            )}
          </Show>
        </Shell>
      </OrgGuard>
    </>
  )
}
