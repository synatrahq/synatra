import { createSignal, createEffect, on, onCleanup, Show, createMemo } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useParams, useNavigate, useSearchParams } from "@solidjs/router"
import { useQuery, useInfiniteQuery, useQueryClient, useMutation } from "@tanstack/solid-query"
import { api, apiBaseURL, OrgGuard, setPendingCount, user, memberRole, activeOrg } from "../../app"
import { IconButton, Input } from "../../ui"
import { Shell } from "../../components"
import { ThreadList, type ThreadListItem } from "./thread-list"
import { ThreadDetail } from "./thread-detail"
import { ComposeModal } from "./compose-modal"
import { InboxSidebar, type ChannelView } from "./inbox-sidebar"
import { AgentInfoPanel } from "./agent-info-panel"
import { ThreadDeleteModal } from "./thread-delete-modal"
import { ChannelCreateModal } from "./channel-create-modal"
import { ThreadListHeader } from "./thread-list-header"
import { RecipeList } from "./recipe-list"
import { RecipeDetail } from "./recipe-detail"
import { RecipeDeleteModal } from "./recipe-delete-modal"
import type {
  ChannelMembers,
  ChannelAgents,
  Thread,
  ThreadMessage,
  ThreadRun,
  ThreadOutputItem,
  ThreadHumanRequest,
  ThreadHumanResponse,
  RecipeExtractResult,
  Recipes,
  Recipe,
  RecipeExecutions,
  RecipeReleases,
  RecipeWorkingCopy,
  Agents,
  Environments,
} from "../../app/api"
import type { ThreadStatus } from "@synatra/core/types"
import { ChannelPanel } from "./channel-panel"
import { RecipeExtractModal } from "./recipe-extract-modal"
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
  archived: boolean
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
  const [searchParams, setSearchParams] = useSearchParams<{
    status?: string
    agent?: string
    thread?: string
    recipe?: string
    view?: string
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedThread, setSelectedThread] = createSignal<Thread | null>(null)
  const [threadLoading, setThreadLoading] = createSignal(false)
  const [responding, setResponding] = createSignal(false)
  const [replying, setReplying] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [recipeSearchQuery, setRecipeSearchQuery] = createSignal("")
  const [refreshing, setRefreshing] = createSignal(false)
  const [composeOpen, setComposeOpen] = createSignal(false)
  const [agentsExpanded, setAgentsExpanded] = createSignal(true)
  const [channelsExpanded, setChannelsExpanded] = createSignal(true)
  const [expandedChannels, setExpandedChannels] = createSignal<Set<string>>(new Set())
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
  const [recipeExtractOpen, setRecipeExtractOpen] = createSignal(false)
  const [recipeExtracting, setRecipeExtracting] = createSignal(false)
  const [recipeExtractResult, setRecipeExtractResult] = createSignal<RecipeExtractResult | null>(null)
  const [recipeExtractContext, setRecipeExtractContext] = createSignal<{
    threadId: string
    runId: string
    agentId: string
    agentName: string
    channelId: string
  } | null>(null)
  const [recipeSaving, setRecipeSaving] = createSignal(false)
  const [recipeDeleteModalOpen, setRecipeDeleteModalOpen] = createSignal(false)
  const [recipeToDelete, setRecipeToDelete] = createSignal<Recipes["items"][number] | null>(null)
  const [selectedEnvironmentId, setSelectedEnvironmentId] = createSignal<string | null>(null)

  const channelsQuery = useQuery(() => ({
    queryKey: ["inbox", "channels", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.channels.$get({ query: {} })
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
    enabled: !!activeOrg()?.id,
  }))

  const countsQuery = useQuery(() => ({
    queryKey: ["inbox", "counts", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.threads.counts.$get()
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
    enabled: !!activeOrg()?.id,
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
      queryKey: ["inbox", "channel", channelId ?? "", "members", activeOrg()?.id],
      queryFn: async (): Promise<ChannelMembers> => {
        if (!channelId) return []
        const res = await api.api.channels[":channelId"].members.$get({ param: { channelId } })
        return res.json()
      },
      enabled: !!channelId && !!activeOrg()?.id,
    }
  })

  const channelAgentsQuery = useQuery(() => {
    const channelId = selectedChannelId()
    return {
      queryKey: ["inbox", "channel", channelId ?? "", "agents", activeOrg()?.id],
      queryFn: async (): Promise<ChannelAgents> => {
        if (!channelId) return []
        const res = await api.api.channels[":channelId"].agents.$get({ param: { channelId } })
        return res.json()
      },
      enabled: !!channelId && !!activeOrg()?.id,
    }
  })

  const channelDataQuery = useQuery(() => {
    const channelId = selectedChannelId()
    return {
      queryKey: ["inbox", "channel", channelId ?? "", "data", activeOrg()?.id],
      queryFn: async () => {
        if (!channelId) return null
        const res = await api.api.channels[":id"].$get({ param: { id: channelId } })
        return res.json() as Promise<ChannelSettingsData>
      },
      enabled: !!channelId && !!activeOrg()?.id,
    }
  })

  const channelMembers = () => channelMembersQuery.data ?? []
  const channelAgents = () => channelAgentsQuery.data ?? []
  const selectedChannelData = () => channelDataQuery.data ?? null

  const allAgentsQuery = useQuery(() => ({
    queryKey: ["agents", activeOrg()?.id],
    queryFn: async (): Promise<Agents> => {
      const res = await api.api.agents.$get()
      return res.json()
    },
    enabled: !!activeOrg()?.id,
  }))

  const environmentsQuery = useQuery(() => ({
    queryKey: ["environments", activeOrg()?.id],
    queryFn: async (): Promise<Environments> => {
      const res = await api.api.environments.$get()
      return res.json()
    },
    enabled: !!activeOrg()?.id,
  }))

  createEffect(() => {
    const envs = environmentsQuery.data
    if (!envs || envs.length === 0) return
    const current = selectedEnvironmentId()
    const isValid = current && envs.some((e) => e.id === current)
    if (!isValid) {
      const production = envs.find((e) => e.slug === "production")
      setSelectedEnvironmentId(production?.id ?? envs[0].id)
    }
  })

  const recipesQuery = useQuery(() => {
    const channelId = selectedChannelId()
    return {
      queryKey: ["recipes", channelId ?? "", activeOrg()?.id],
      queryFn: async (): Promise<Recipes> => {
        if (!channelId) return { items: [], nextCursor: null }
        const res = await api.api.recipes.$get({ query: { channelId } })
        return res.json()
      },
      enabled: !!channelId && !!activeOrg()?.id,
    }
  })

  const recipeModelsQuery = useQuery(() => ({
    queryKey: ["recipe-models", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.recipes.models.$get()
      return res.json()
    },
    enabled: recipeExtractOpen() && !!activeOrg()?.id,
  }))

  const channelView = (): ChannelView => (searchParams.view === "recipes" ? "recipes" : "threads")

  const selectedRecipe = createMemo(() => {
    const id = searchParams.recipe
    if (!id || !recipesQuery.data) return null
    return recipesQuery.data.items.find((r) => r.id === id) ?? null
  })

  const recipeDetailQuery = useQuery(() => {
    const recipe = selectedRecipe()
    return {
      queryKey: ["recipe", recipe?.id ?? "", activeOrg()?.id],
      queryFn: async (): Promise<Recipe | null> => {
        if (!recipe) return null
        const res = await api.api.recipes[":id"].$get({ param: { id: recipe.id } })
        return res.json()
      },
      enabled: !!recipe,
    }
  })

  const recipeExecutionsQuery = useQuery(() => {
    const recipe = selectedRecipe()
    return {
      queryKey: ["recipe-executions", recipe?.id ?? "", activeOrg()?.id],
      queryFn: async (): Promise<RecipeExecutions> => {
        if (!recipe) return []
        const res = await api.api.recipes[":id"].executions.$get({ param: { id: recipe.id } })
        return res.json()
      },
      enabled: !!recipe,
    }
  })

  const recipeReleasesQuery = useQuery(() => {
    const recipe = selectedRecipe()
    return {
      queryKey: ["recipe-releases", recipe?.id ?? "", activeOrg()?.id],
      queryFn: async (): Promise<RecipeReleases> => {
        if (!recipe) return []
        const res = await api.api.recipes[":id"].releases.$get({ param: { id: recipe.id } })
        return res.json()
      },
      enabled: !!recipe,
    }
  })

  const recipeWorkingCopyQuery = useQuery(() => {
    const recipe = selectedRecipe()
    return {
      queryKey: ["recipe-working-copy", recipe?.id ?? "", activeOrg()?.id],
      queryFn: async (): Promise<RecipeWorkingCopy | null> => {
        if (!recipe) return null
        const res = await api.api.recipes[":id"]["working-copy"].$get({ param: { id: recipe.id } })
        return res.json()
      },
      enabled: !!recipe,
    }
  })

  const recipeUpdateMutation = useMutation(() => ({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string }) => {
      const res = await api.api.recipes[":id"].$patch({ param: { id }, json: data })
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
      queryClient.invalidateQueries({ queryKey: ["recipe", variables.id, activeOrg()?.id] })
    },
  }))

  const recipeExecuteMutation = useMutation(() => ({
    mutationFn: async ({
      id,
      environmentId,
      inputs,
    }: {
      id: string
      environmentId: string
      inputs: Record<string, unknown>
    }) => {
      const res = await api.api.recipes[":id"].execute.$post({
        param: { id },
        json: { inputs, environmentId },
      })
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["recipe-executions", id, activeOrg()?.id] })
    },
  }))

  const recipeDeleteMutation = useMutation(() => ({
    mutationFn: async (id: string) => {
      await api.api.recipes[":id"].$delete({ param: { id } })
    },
    onSuccess: () => {
      const deletedId = recipeToDelete()?.id
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
      setRecipeDeleteModalOpen(false)
      setRecipeToDelete(null)
      if (searchParams.recipe === deletedId) {
        setSearchParams({ recipe: undefined })
      }
    },
  }))

  const recipeDeployMutation = useMutation(() => ({
    mutationFn: async (data: { id: string; bump: "major" | "minor" | "patch"; description: string }) => {
      const res = await api.api.recipes[":id"].deploy.$post({
        param: { id: data.id },
        json: { bump: data.bump, description: data.description },
      })
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
      queryClient.invalidateQueries({ queryKey: ["recipe", variables.id] })
      queryClient.invalidateQueries({ queryKey: ["recipe-releases", variables.id] })
      queryClient.invalidateQueries({ queryKey: ["recipe-working-copy", variables.id] })
    },
  }))

  const recipeAdoptMutation = useMutation(() => ({
    mutationFn: async (data: { recipeId: string; releaseId: string }) => {
      const res = await api.api.recipes[":id"].releases[":releaseId"].adopt.$post({
        param: { id: data.recipeId, releaseId: data.releaseId },
      })
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
      queryClient.invalidateQueries({ queryKey: ["recipe", variables.recipeId] })
    },
  }))

  const recipeCheckoutMutation = useMutation(() => ({
    mutationFn: async (data: { recipeId: string; releaseId: string }) => {
      const res = await api.api.recipes[":id"].releases[":releaseId"].checkout.$post({
        param: { id: data.recipeId, releaseId: data.releaseId },
      })
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["recipe-working-copy", variables.recipeId] })
    },
  }))

  const [recipeResponding, setRecipeResponding] = createSignal(false)

  const handleRecipeRespond = async (executionId: string, response: Record<string, unknown>) => {
    const recipe = selectedRecipe()
    const envId = selectedEnvironmentId()
    if (!recipe || !envId) return

    setRecipeResponding(true)
    try {
      await api.api.recipes[":id"].executions[":executionId"].respond.$post({
        param: { id: recipe.id, executionId },
        json: { response, environmentId: envId },
      })
      queryClient.invalidateQueries({ queryKey: ["recipe-executions", recipe.id, activeOrg()?.id] })
    } finally {
      setRecipeResponding(false)
    }
  }

  const allAgents = () => allAgentsQuery.data ?? []
  const environments = () => environmentsQuery.data ?? []
  const recipes = () => recipesQuery.data?.items ?? []

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
    queryKey: ["inbox", "threads", statusFilter(), channelFilter(), agentFilter(), activeOrg()?.id],
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
      return res.json()
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!activeOrg()?.id,
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
      ["inbox", "threads", statusFilter(), channelFilter(), agentFilter(), activeOrg()?.id],
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
      ["inbox", "threads", statusFilter(), channelFilter(), agentFilter(), activeOrg()?.id],
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
    await queryClient.refetchQueries({
      queryKey: ["inbox", "threads", statusFilter(), channelFilter(), agentFilter(), activeOrg()?.id],
    })
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
      await api.api.threads[":threadId"]["human-requests"][":requestId"].respond.$post({
        param: { threadId, requestId },
        json: payload,
      })
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
      await api.api.threads[":id"].reply.$post({
        param: { id: threadId },
        json: { message },
      })
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
      await api.api.threads[":id"].$delete({ param: { id: thread.id } })
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
      await api.api.threads[":id"].archive.$post({ param: { id } })
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
      await api.api.threads[":id"].unarchive.$post({ param: { id } })
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
      await api.api.channels.$post({ json: data })
      setChannelCreateOpen(false)
      invalidateChannels()
    } finally {
      setCreatingChannel(false)
    }
  }

  const handleAddMembers = async (memberIds: string[]) => {
    const channelId = channelFilter()
    if (!channelId) return
    await api.api.channels[":channelId"].members.$post({
      param: { channelId },
      json: { memberIds },
    })
    invalidateChannelMembers()
  }

  const handleRemoveMember = async (memberId: string) => {
    const channelId = channelFilter()
    if (!channelId) return
    await api.api.channels[":channelId"].members[":memberId"].$delete({
      param: { channelId, memberId },
    })
    invalidateChannelMembers()
  }

  const handleUpdateMemberRole = async (memberId: string, role: "owner" | "member") => {
    const channelId = channelFilter()
    if (!channelId) return
    await api.api.channels[":channelId"].members[":memberId"].$patch({
      param: { channelId, memberId },
      json: { role },
    })
    invalidateChannelMembers()
  }

  const handleAddAgents = async (agentIds: string[]) => {
    const channelId = channelFilter()
    if (!channelId) return
    await api.api.channels[":channelId"].agents.$post({
      param: { channelId },
      json: { agentIds },
    })
    invalidateChannelAgents()
  }

  const handleRemoveAgent = async (agentId: string) => {
    const channelId = channelFilter()
    if (!channelId) return
    await api.api.channels[":channelId"].agents[":agentId"].$delete({
      param: { channelId, agentId },
    })
    invalidateChannelAgents()
  }

  const handleSaveChannelSettings = async (data: { name: string; description?: string }) => {
    const channelId = channelFilter()
    if (!channelId) return
    setSavingChannel(true)
    try {
      await api.api.channels[":id"].$patch({
        param: { id: channelId },
        json: data,
      })
      invalidateChannels()
      invalidateChannelData()
    } finally {
      setSavingChannel(false)
    }
  }

  const handleArchiveChannel = async () => {
    const channelId = channelFilter()
    if (!channelId) return
    await api.api.channels[":id"].archive.$post({ param: { id: channelId } })
    navigate("/inbox")
    invalidateChannels()
  }

  const handleUnarchiveChannel = async () => {
    const channelId = channelFilter()
    if (!channelId) return
    await api.api.channels[":id"].unarchive.$post({ param: { id: channelId } })
    invalidateChannels()
    invalidateChannelData()
  }

  const handleCreateRecipe = (runId: string) => {
    const thread = selectedThread()
    if (!thread || !thread.channelId) return

    setRecipeExtractContext({
      threadId: thread.id,
      runId,
      agentId: thread.agentId,
      agentName: thread.agent?.name ?? "Agent",
      channelId: thread.channelId,
    })
    setRecipeExtractResult(null)
    setRecipeExtracting(false)
    setRecipeExtractOpen(true)
  }

  const handleExtractRecipe = async (modelId: string | null) => {
    const context = recipeExtractContext()
    const envId = selectedEnvironmentId()
    if (!context || !envId) return

    setRecipeExtracting(true)

    try {
      const res = await api.api.recipes.extract.$post({
        json: { threadId: context.threadId, runId: context.runId, environmentId: envId, modelId: modelId ?? undefined },
      })
      const result = await res.json()
      setRecipeExtractResult(result)
    } catch (e) {
      console.error("Failed to extract recipe", e)
      setRecipeExtractOpen(false)
    } finally {
      setRecipeExtracting(false)
    }
  }

  const handleSaveRecipe = async (data: { name: string; description: string }) => {
    const context = recipeExtractContext()
    const result = recipeExtractResult()
    if (!context || !result || !("steps" in result)) return

    setRecipeSaving(true)
    try {
      const created = await api.api.recipes.$post({
        json: {
          agentId: context.agentId,
          channelId: context.channelId,
          name: data.name,
          description: data.description || undefined,
          inputs: result.inputs,
          steps: result.steps,
          outputs: result.outputs,
          sourceThreadId: context.threadId,
          sourceRunId: context.runId,
        },
      })
      const recipe = await created.json()
      setRecipeExtractOpen(false)
      setRecipeExtractResult(null)
      const channel = channels().find((c) => c.id === context.channelId)
      setRecipeExtractContext(null)
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
      if (channel) {
        navigate(`/inbox/${channel.slug}?view=recipes&recipe=${recipe.id}`)
      } else {
        setSearchParams({ view: "recipes", thread: undefined, recipe: recipe.id })
      }
    } catch (e) {
      console.error("Failed to save recipe", e)
    } finally {
      setRecipeSaving(false)
    }
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

  const handleToggleChannelExpand = (channelId: string) => {
    setExpandedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(channelId)) {
        next.delete(channelId)
      } else {
        next.add(channelId)
      }
      return next
    })
  }

  const handleChannelViewChange = (view: ChannelView, channelId: string) => {
    const channel = channels().find((c) => c.id === channelId)
    if (!channel) return
    if (view === "threads") {
      navigate(`/inbox/${channel.slug}`)
    } else {
      navigate(`/inbox/${channel.slug}?view=recipes`)
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

  const filteredRecipes = () => {
    const query = recipeSearchQuery().toLowerCase()
    if (!query) return recipes()
    return recipes().filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        allAgents()
          .find((a) => a.id === r.agentId)
          ?.name?.toLowerCase()
          ?.includes(query),
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
          setSearchParams({ view: undefined, recipe: undefined })
        }
      },
    ),
  )

  createEffect(
    on(selectedChannelId, (channelId) => {
      if (channelId) {
        setExpandedChannels((prev) => {
          if (prev.has(channelId)) return prev
          const next = new Set(prev)
          next.add(channelId)
          return next
        })
      }
    }),
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
            expandedChannels={expandedChannels()}
            onToggleChannelExpand={handleToggleChannelExpand}
            channelView={channelView()}
            onChannelViewChange={handleChannelViewChange}
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

            <Show when={channelView() === "threads" || !channelFilter()}>
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
            </Show>

            <Show when={channelView() === "recipes" && channelFilter()}>
              <div class="flex items-center gap-2 px-3.5 py-1.5">
                <div class="relative flex-1">
                  <MagnifyingGlass class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted/60" />
                  <Input
                    type="text"
                    placeholder="Search"
                    value={recipeSearchQuery()}
                    onInput={(e) => setRecipeSearchQuery(e.currentTarget.value)}
                    class="w-full pl-7"
                  />
                </div>
              </div>

              <RecipeList
                recipes={filteredRecipes()}
                agents={allAgents()}
                selectedId={searchParams.recipe}
                loading={recipesQuery.isPending}
                onDelete={(recipe) => {
                  setRecipeToDelete(recipe)
                  setRecipeDeleteModalOpen(true)
                }}
              />
            </Show>
          </div>

          <Show
            when={channelView() === "recipes" && channelFilter()}
            fallback={
              <ThreadDetail
                thread={selectedThread()}
                loading={threadLoading()}
                isChannelOwner={isChannelOwner()}
                onHumanRequestRespond={handleHumanRequestRespond}
                onReply={handleReply}
                onAgentClick={(agentId) => setAgentPanelId(agentId)}
                onCreateRecipe={handleCreateRecipe}
                responding={responding()}
                replying={replying()}
              />
            }
          >
            <RecipeDetail
              recipe={recipeDetailQuery.data ?? null}
              executions={recipeExecutionsQuery.data ?? []}
              releases={recipeReleasesQuery.data ?? []}
              workingCopy={recipeWorkingCopyQuery.data ?? null}
              agents={allAgents()}
              environments={environments()}
              selectedEnvironmentId={selectedEnvironmentId()}
              onEnvironmentChange={setSelectedEnvironmentId}
              loading={recipeDetailQuery.isLoading}
              onUpdateName={async (name) => {
                const recipe = selectedRecipe()
                if (recipe) {
                  await recipeUpdateMutation.mutateAsync({ id: recipe.id, name })
                }
              }}
              onUpdateDescription={async (description) => {
                const recipe = selectedRecipe()
                if (recipe) {
                  await recipeUpdateMutation.mutateAsync({ id: recipe.id, description })
                }
              }}
              onExecute={(inputs) => {
                const recipe = selectedRecipe()
                const envId = selectedEnvironmentId()
                if (recipe && envId) {
                  recipeExecuteMutation.mutate({ id: recipe.id, environmentId: envId, inputs })
                }
              }}
              executing={recipeExecuteMutation.isPending}
              onRespond={handleRecipeRespond}
              responding={recipeResponding()}
              onDeploy={async (data) => {
                const recipe = selectedRecipe()
                if (recipe) {
                  await recipeDeployMutation.mutateAsync({ id: recipe.id, ...data })
                }
              }}
              deploying={recipeDeployMutation.isPending}
              onAdopt={async (releaseId) => {
                const recipe = selectedRecipe()
                if (recipe) {
                  await recipeAdoptMutation.mutateAsync({ recipeId: recipe.id, releaseId })
                }
              }}
              onCheckout={async (releaseId) => {
                const recipe = selectedRecipe()
                if (recipe) {
                  await recipeCheckoutMutation.mutateAsync({ recipeId: recipe.id, releaseId })
                }
              }}
            />
          </Show>

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
                archived={channel().archived}
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

          <RecipeExtractModal
            open={recipeExtractOpen()}
            models={recipeModelsQuery.data?.models ?? []}
            modelsLoading={recipeModelsQuery.isPending}
            extracting={recipeExtracting()}
            extractResult={recipeExtractResult()}
            agentId={recipeExtractContext()?.agentId ?? ""}
            agentName={recipeExtractContext()?.agentName ?? "Agent"}
            onClose={() => {
              setRecipeExtractOpen(false)
              setRecipeExtractResult(null)
              setRecipeExtractContext(null)
            }}
            onExtract={handleExtractRecipe}
            onSave={handleSaveRecipe}
            saving={recipeSaving()}
          />

          <RecipeDeleteModal
            open={recipeDeleteModalOpen()}
            recipeName={recipeToDelete()?.name ?? ""}
            onClose={() => {
              setRecipeDeleteModalOpen(false)
              setRecipeToDelete(null)
            }}
            onConfirm={async () => {
              const recipe = recipeToDelete()
              if (recipe) {
                await recipeDeleteMutation.mutateAsync(recipe.id)
              }
            }}
            deleting={recipeDeleteMutation.isPending}
          />
        </Shell>
      </OrgGuard>
    </>
  )
}
