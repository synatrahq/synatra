import { createSignal, createEffect, createMemo, Show } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useParams, useNavigate, useSearchParams } from "@solidjs/router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query"
import { api, BuilderGuard, activeOrg } from "../../app"
import type {
  Triggers,
  Prompts,
  Environments,
  Channels,
  TriggerCreateInput,
  TriggerUpdateInput,
  TriggerToggleInput,
  TriggerDeployInput,
  TriggerWorkingCopySaveInput,
  TriggerEnvironmentAddInput,
  TriggerEnvironmentUpdateInput,
  TriggerRegenerateSecretInput,
  ChannelAgentsAddInput,
} from "../../app/api"
import { Shell } from "../../components"
import { TriggerSidebar } from "./trigger-sidebar"
import { TriggerDetail, type TriggerDetailData, type AppAccountInfo, type TriggerWorkingCopy } from "./trigger-detail"
import { TriggerCreateModal } from "./trigger-create-modal"
import { TriggerDeleteModal } from "./trigger-delete-modal"
import { AppConnectModal } from "../settings/app-connect-modal"
import type { TriggerRelease } from "./trigger-detail/version-control"

const noop = () => {}

function PageSkeleton() {
  const params = useParams<{ id?: string }>()
  return (
    <Shell>
      <TriggerSidebar triggers={[]} onCreateClick={noop} onDeleteClick={noop} />
      <TriggerDetail trigger={null} prompts={[]} environments={[]} channels={[]} loading={!!params.id} />
    </Shell>
  )
}

type AgentWithChannels = {
  id: string
  name: string
  slug: string
  icon: string
  iconColor: string
  channelIds: string[]
}

export default function TriggersPage() {
  const params = useParams<{ id?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [createModalOpen, setCreateModalOpen] = createSignal(false)
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false)
  const [deletingTrigger, setDeletingTrigger] = createSignal<{ id: string; name: string; slug: string } | null>(null)
  const [appConnectModalOpen, setAppConnectModalOpen] = createSignal(false)
  const [connectingAppId, setConnectingAppId] = createSignal<string | null>(null)
  const [appConnecting, setAppConnecting] = createSignal(false)
  const [pendingAppAccountId, setPendingAppAccountId] = createSignal<string | null>(null)

  const triggersQuery = useQuery(() => ({
    queryKey: ["triggers"],
    queryFn: async (): Promise<Triggers> => {
      const res = await api.api.triggers.$get()
      if (!res.ok) throw new Error("Failed to fetch triggers")
      return res.json()
    },
  }))

  const agentsQuery = useQuery(() => ({
    queryKey: ["agents-with-channels"],
    queryFn: async (): Promise<AgentWithChannels[]> => {
      const res = await api.api.agents.$get()
      if (!res.ok) throw new Error("Failed to fetch agents")
      const data = await res.json()
      const agentsWithChannels = await Promise.all(
        data.map(async (a) => {
          const channelsRes = await api.api.agents[":id"].channels.$get({ param: { id: a.id } })
          const channelIds = channelsRes.ok ? ((await channelsRes.json()) as string[]) : []
          return {
            id: a.id,
            name: a.name,
            slug: a.slug,
            icon: a.icon,
            iconColor: a.iconColor,
            channelIds,
          }
        }),
      )
      return agentsWithChannels
    },
  }))

  const promptsQuery = useQuery(() => ({
    queryKey: ["prompts"],
    queryFn: async (): Promise<Prompts> => {
      const res = await api.api.prompts.$get()
      if (!res.ok) throw new Error("Failed to fetch prompts")
      return res.json()
    },
  }))

  const environmentsQuery = useQuery(() => ({
    queryKey: ["environments"],
    queryFn: async (): Promise<Environments> => {
      const res = await api.api.environments.$get()
      if (!res.ok) throw new Error("Failed to fetch environments")
      return res.json()
    },
  }))

  const channelsQuery = useQuery(() => ({
    queryKey: ["channels"],
    queryFn: async (): Promise<Channels> => {
      const res = await api.api.channels.$get({ query: {} })
      if (!res.ok) throw new Error("Failed to fetch channels")
      return res.json()
    },
  }))

  const appAccountsQuery = useQuery(() => ({
    queryKey: ["app-accounts"],
    queryFn: async () => {
      const res = await api.api["app-accounts"].$get()
      if (!res.ok) throw new Error("Failed to fetch app accounts")
      return res.json() as Promise<AppAccountInfo[]>
    },
  }))

  const selectedTriggerFromList = createMemo(() => {
    if (!params.id || !triggersQuery.data) return null
    return triggersQuery.data.find((t) => t.id === params.id) ?? null
  })

  const triggerDetailQuery = useQuery(() => {
    const trigger = selectedTriggerFromList()
    return {
      queryKey: ["trigger", trigger?.id ?? ""],
      queryFn: async () => {
        if (!trigger) return null
        const res = await api.api.triggers[":id"].$get({ param: { id: trigger.id } })
        if (!res.ok) throw new Error("Failed to fetch trigger detail")
        const data = await res.json()
        return {
          id: data.id,
          organizationId: data.organizationId,
          currentReleaseId: data.currentReleaseId,
          version: data.version,
          configHash: data.configHash,
          agentId: data.agentId,
          agentReleaseId: data.agentReleaseId,
          agentVersionMode: data.agentVersionMode,
          promptId: data.promptId,
          promptReleaseId: data.promptReleaseId,
          promptVersionMode: data.promptVersionMode,
          mode: data.mode,
          template: data.template,
          script: data.script,
          payloadSchema: data.payloadSchema,
          name: data.name,
          slug: data.slug,
          type: data.type,
          cron: data.cron,
          timezone: data.timezone,
          input: data.input as Record<string, unknown> | null,
          appAccountId: data.appAccountId ?? null,
          appEvents: data.appEvents ?? null,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          agent: data.agent,
          prompt: data.prompt,
          environments: data.environments ?? [],
        } as TriggerDetailData
      },
      enabled: !!trigger,
    }
  })

  const workingCopyQuery = useQuery(() => {
    const trigger = selectedTriggerFromList()
    return {
      queryKey: ["trigger-working-copy", trigger?.id ?? ""],
      queryFn: async () => {
        if (!trigger) return null
        const res = await api.api.triggers[":id"]["working-copy"].$get({ param: { id: trigger.id } })
        if (!res.ok) return null
        return res.json() as Promise<TriggerWorkingCopy>
      },
      enabled: !!trigger,
    }
  })

  const releasesQuery = useQuery(() => {
    const trigger = selectedTriggerFromList()
    return {
      queryKey: ["trigger-releases", trigger?.id ?? ""],
      queryFn: async () => {
        if (!trigger) return []
        const res = await api.api.triggers[":id"].releases.$get({ param: { id: trigger.id } })
        if (!res.ok) return []
        return res.json() as Promise<TriggerRelease[]>
      },
      enabled: !!trigger,
    }
  })

  const promptReleasesQuery = useQuery(() => ({
    queryKey: ["prompt-releases", triggerDetailQuery.data?.promptId],
    queryFn: async () => {
      const promptId = triggerDetailQuery.data?.promptId
      if (!promptId) return []
      const res = await api.api.prompts[":id"].releases.$get({ param: { id: promptId } })
      if (!res.ok) throw new Error("Failed to fetch prompt releases")
      return res.json() as Promise<Array<{ id: string; version: string; createdAt: string }>>
    },
    enabled: !!triggerDetailQuery.data?.promptId,
  }))

  const createMutate = useMutation(() => ({
    mutationFn: async (data: TriggerCreateInput) => {
      const res = await api.api.triggers.$post({ json: data })
      if (!res.ok) throw new Error("Failed to create trigger")
      return res.json()
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] })
      setCreateModalOpen(false)
      navigate(`/triggers/${created.id}`)
    },
  }))

  const deleteMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      const res = await api.api.triggers[":id"].$delete({ param: { id } })
      if (!res.ok) throw new Error("Failed to delete trigger")
    },
    onSuccess: () => {
      const trigger = deletingTrigger()
      queryClient.invalidateQueries({ queryKey: ["triggers"] })
      setDeleteModalOpen(false)
      setDeletingTrigger(null)
      if (params.id === trigger?.id) {
        navigate("/triggers")
      }
    },
  }))

  const toggleMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & TriggerToggleInput) => {
      const { id, ...json } = data
      const res = await api.api.triggers[":id"].toggle.$post({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to toggle trigger")
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] })
      queryClient.invalidateQueries({ queryKey: ["trigger", id] })
    },
  }))

  const updateMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & TriggerUpdateInput) => {
      const { id, ...json } = data
      const res = await api.api.triggers[":id"].$patch({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to update trigger")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] })
      queryClient.invalidateQueries({ queryKey: ["trigger", variables.id] })
    },
  }))

  const addAgentToChannelMutate = useMutation(() => ({
    mutationFn: async (data: { channelId: string } & ChannelAgentsAddInput) => {
      const { channelId, ...json } = data
      const res = await api.api.channels[":channelId"].agents.$post({ param: { channelId }, json })
      if (!res.ok) throw new Error("Failed to add agent to channel")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents-with-channels"] })
    },
  }))

  const saveWorkingCopyMutate = useMutation(() => ({
    mutationFn: async (data: { triggerId: string } & TriggerWorkingCopySaveInput) => {
      const { triggerId, ...json } = data
      const res = await api.api.triggers[":id"]["working-copy"].save.$post({
        param: { id: triggerId },
        json,
      })
      if (!res.ok) throw new Error("Failed to save working copy")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trigger-working-copy", variables.triggerId] })
    },
  }))

  const deployMutate = useMutation(() => ({
    mutationFn: async (data: { triggerId: string } & TriggerDeployInput) => {
      const { triggerId, ...json } = data
      const res = await api.api.triggers[":id"].deploy.$post({ param: { id: triggerId }, json })
      if (!res.ok) throw new Error("Failed to deploy")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] })
      queryClient.invalidateQueries({ queryKey: ["trigger", variables.triggerId] })
      queryClient.invalidateQueries({ queryKey: ["trigger-working-copy", variables.triggerId] })
      queryClient.invalidateQueries({ queryKey: ["trigger-releases", variables.triggerId] })
    },
  }))

  const adoptMutate = useMutation(() => ({
    mutationFn: async (data: { triggerId: string; releaseId: string }) => {
      const res = await api.api.triggers[":id"].releases[":releaseId"].adopt.$post({
        param: { id: data.triggerId, releaseId: data.releaseId },
      })
      if (!res.ok) throw new Error("Failed to adopt release")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] })
      queryClient.invalidateQueries({ queryKey: ["trigger", variables.triggerId] })
    },
  }))

  const checkoutMutate = useMutation(() => ({
    mutationFn: async (data: { triggerId: string; releaseId: string }) => {
      const res = await api.api.triggers[":id"].releases[":releaseId"].checkout.$post({
        param: { id: data.triggerId, releaseId: data.releaseId },
      })
      if (!res.ok) throw new Error("Failed to checkout release")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trigger-working-copy", variables.triggerId] })
    },
  }))

  const regenerateSecretMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & TriggerRegenerateSecretInput) => {
      const { id, ...json } = data
      const res = await api.api.triggers[":id"]["regenerate-secret"].$post({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to regenerate secret")
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["trigger", id] })
    },
  }))

  const regenerateDebugSecretMutate = useMutation(() => ({
    mutationFn: async ({ id, environmentId }: { id: string; environmentId: string }) => {
      const res = await api.api.triggers[":id"].environments[":environmentId"]["regenerate-debug-secret"].$post({
        param: { id, environmentId },
      })
      if (!res.ok) throw new Error("Failed to regenerate debug secret")
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["trigger", id] })
    },
  }))

  const addEnvironmentMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & TriggerEnvironmentAddInput) => {
      const { id, ...json } = data
      const res = await api.api.triggers[":id"].environments.add.$post({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to add environment")
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["trigger", id] })
    },
  }))

  const removeEnvironmentMutate = useMutation(() => ({
    mutationFn: async ({ id, environmentId }: { id: string; environmentId: string }) => {
      const res = await api.api.triggers[":id"].environments[":environmentId"].remove.$post({
        param: { id, environmentId },
      })
      if (!res.ok) throw new Error("Failed to remove environment")
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["trigger", id] })
    },
  }))

  const updateEnvironmentChannelMutate = useMutation(() => ({
    mutationFn: async (data: { id: string; environmentId: string } & TriggerEnvironmentUpdateInput) => {
      const { id, environmentId, ...json } = data
      const res = await api.api.triggers[":id"].environments[":environmentId"].$patch({
        param: { id, environmentId },
        json,
      })
      if (!res.ok) throw new Error("Failed to update environment")
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["trigger", id] })
    },
  }))

  createEffect(() => {
    const param = searchParams.newAppAccountId
    const newAppAccountId = Array.isArray(param) ? param[0] : param
    if (newAppAccountId) {
      setPendingAppAccountId(newAppAccountId)
      setSearchParams({ newAppAccountId: undefined }, { replace: true })
      queryClient.invalidateQueries({ queryKey: ["app-accounts"] })
    }
  })

  const handleAppConnect = async (appId: string, name: string) => {
    setAppConnecting(true)
    try {
      const returnUrl = `${window.location.origin}/triggers/${params.id}`
      if (appId === "github") {
        const res = await api.api["app-accounts"].github.start.$post({ json: { name, returnUrl } })
        if (res.ok) {
          const data = await res.json()
          window.location.href = data.url
        }
      } else {
        const res = await api.api["app-accounts"].oauth.start.$post({
          json: { appId: appId as "intercom", name, returnUrl },
        })
        if (res.ok) {
          const data = await res.json()
          window.location.href = data.authUrl
        }
      }
    } finally {
      setAppConnecting(false)
    }
  }

  const handleDeleteClick = (trigger: Triggers[number]) => {
    setDeletingTrigger({ id: trigger.id, name: trigger.name, slug: trigger.slug })
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    const trigger = deletingTrigger()
    if (trigger) await deleteMutate.mutateAsync(trigger.id)
  }

  const handlePromptChange = async (promptId: string) => {
    if (promptId) {
      queryClient.invalidateQueries({ queryKey: ["prompt-releases", promptId] })
    }
  }

  const handleUpdateName = async (id: string, name: string) => {
    await updateMutate.mutateAsync({ id, name })
  }

  const handleSaveWorkingCopy = async (
    triggerId: string,
    config: TriggerWorkingCopySaveInput,
    options?: { addAgentToChannel?: boolean; agentId?: string; channelId?: string },
  ) => {
    if (options?.addAgentToChannel && options.agentId && options.channelId) {
      await addAgentToChannelMutate.mutateAsync({
        channelId: options.channelId,
        agentIds: [options.agentId],
      })
    }
    await saveWorkingCopyMutate.mutateAsync({ triggerId, ...config })
  }

  const handleDeploy = async (triggerId: string, bump: "major" | "minor" | "patch", description: string) => {
    await deployMutate.mutateAsync({ triggerId, bump, description })
  }

  const handleAdopt = async (triggerId: string, releaseId: string) => {
    await adoptMutate.mutateAsync({ triggerId, releaseId })
  }

  const handleCheckout = async (triggerId: string, releaseId: string) => {
    await checkoutMutate.mutateAsync({ triggerId, releaseId })
  }

  const handleAddEnvironment = async (
    triggerId: string,
    environmentId: string,
    channelId: string,
    addAgentToChannel: boolean,
  ) => {
    const trigger = triggerDetailQuery.data
    if (!trigger) return
    if (addAgentToChannel) {
      await addAgentToChannelMutate.mutateAsync({
        channelId,
        agentIds: [trigger.agentId],
      })
    }
    await addEnvironmentMutate.mutateAsync({ id: triggerId, environmentId, channelId })
  }

  const handleRemoveEnvironment = async (triggerId: string, environmentId: string) => {
    await removeEnvironmentMutate.mutateAsync({ id: triggerId, environmentId })
  }

  const handleUpdateEnvironmentChannel = async (triggerId: string, environmentId: string, channelId: string) => {
    await updateEnvironmentChannelMutate.mutateAsync({ id: triggerId, environmentId, channelId })
  }

  const handleToggleEnvironment = async (triggerId: string, environmentId: string) => {
    await toggleMutate.mutateAsync({ id: triggerId, environmentId })
  }

  const handleRegenerateWebhookSecret = async (triggerId: string, environmentId: string) => {
    await regenerateSecretMutate.mutateAsync({ id: triggerId, environmentId })
  }

  const handleRegenerateDebugSecret = async (triggerId: string, environmentId: string) => {
    await regenerateDebugSecretMutate.mutateAsync({ id: triggerId, environmentId })
  }

  const triggers = () => triggersQuery.data ?? []
  const agents = () => agentsQuery.data ?? []
  const prompts = () => promptsQuery.data ?? []
  const environments = () => environmentsQuery.data ?? []
  const channels = () => channelsQuery.data ?? []
  const appAccounts = () => appAccountsQuery.data ?? []

  const sortedAgents = () => {
    const agentOrder = new Map<string, number>()
    triggers().forEach((t, i) => {
      if (t.agentId && !agentOrder.has(t.agentId)) {
        agentOrder.set(t.agentId, i)
      }
    })
    return [...agents()].sort((a, b) => {
      const orderA = agentOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const orderB = agentOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return orderA - orderB
    })
  }

  return (
    <>
      <Title>
        {triggerDetailQuery.data?.name
          ? `${triggerDetailQuery.data.name} | ${activeOrg()?.name ?? "Synatra"}`
          : `Triggers | ${activeOrg()?.name ?? "Synatra"}`}
      </Title>
      <Meta name="description" content="Set up webhooks, schedules, and app events to run AI agents proactively." />
      <BuilderGuard fallback={<PageSkeleton />}>
        <Shell>
          <TriggerSidebar
            triggers={triggers()}
            onCreateClick={() => setCreateModalOpen(true)}
            onDeleteClick={handleDeleteClick}
          />
          <Show
            when={params.id && triggerDetailQuery.data}
            fallback={<TriggerDetail trigger={null} prompts={[]} environments={[]} channels={[]} loading={false} />}
          >
            <TriggerDetail
              trigger={triggerDetailQuery.data ?? null}
              workingCopy={workingCopyQuery.data ?? null}
              releases={releasesQuery.data ?? []}
              prompts={prompts()}
              environments={environments()}
              channels={channels()}
              appAccounts={appAccounts()}
              agentChannelIds={agents().find((a) => a.id === triggerDetailQuery.data?.agentId)?.channelIds ?? []}
              promptReleases={promptReleasesQuery.data ?? []}
              pendingAppAccountId={pendingAppAccountId()}
              loading={triggersQuery.isPending && !triggerDetailQuery.data}
              onPromptChange={handlePromptChange}
              onAppConnect={(appId) => {
                setConnectingAppId(appId)
                setAppConnectModalOpen(true)
              }}
              onUpdateName={handleUpdateName}
              onSaveWorkingCopy={handleSaveWorkingCopy}
              onDeploy={handleDeploy}
              onAdopt={handleAdopt}
              onCheckout={handleCheckout}
              onAddEnvironment={handleAddEnvironment}
              onRemoveEnvironment={handleRemoveEnvironment}
              onUpdateEnvironmentChannel={handleUpdateEnvironmentChannel}
              onToggleEnvironment={handleToggleEnvironment}
              onRegenerateWebhookSecret={handleRegenerateWebhookSecret}
              onRegenerateDebugSecret={handleRegenerateDebugSecret}
            />
          </Show>
        </Shell>
        <TriggerCreateModal
          open={createModalOpen()}
          agents={sortedAgents()}
          onClose={() => setCreateModalOpen(false)}
          onSave={async (data) => {
            await createMutate.mutateAsync(data)
          }}
          saving={createMutate.isPending}
        />
        <TriggerDeleteModal
          open={deleteModalOpen()}
          triggerName={deletingTrigger()?.name ?? ""}
          onClose={() => {
            setDeleteModalOpen(false)
            setDeletingTrigger(null)
          }}
          onConfirm={handleDeleteConfirm}
          deleting={deleteMutate.isPending}
        />
        <AppConnectModal
          open={appConnectModalOpen()}
          appId={connectingAppId()}
          onClose={() => {
            setAppConnectModalOpen(false)
            setConnectingAppId(null)
          }}
          onConnect={handleAppConnect}
          connecting={appConnecting()}
        />
      </BuilderGuard>
    </>
  )
}
