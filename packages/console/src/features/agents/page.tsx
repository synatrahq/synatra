import { createSignal, createMemo, createEffect, Show } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useParams, useNavigate, useSearchParams } from "@solidjs/router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query"
import type { AgentRuntimeConfig } from "@synatra/core/types"
import { api, BuilderGuard, activeOrg } from "../../app"
import { Shell } from "../../components"
import { AgentsSidebar } from "./agents-sidebar"
import { AgentList } from "./agent-list"
import { AgentDetail } from "./agent-detail"
import type {
  Agents,
  Agent,
  AgentReleases,
  AgentWorkingCopy,
  Environments,
  AgentCreateInput,
  AgentUpdateInput,
  AgentDeployInput,
  AgentWorkingCopySaveInput,
} from "../../app/api"
import { AgentCreateModal } from "./agent-create-modal"
import { AgentEditModal } from "./agent-edit-modal"
import { AgentDeleteModal } from "./agent-delete-modal"

const noop = () => {}

function PageSkeleton() {
  const params = useParams<{ id?: string }>()
  return (
    <Shell>
      <AgentsSidebar recents={[]} onCreateClick={noop} />
      <Show when={params.id} fallback={<AgentList agents={[]} loading={true} onCreateClick={noop} />}>
        <AgentDetail
          agent={null}
          agents={[]}
          releases={[]}
          workingCopy={null}
          environments={[]}
          selectedEnvironmentId={null}
          loading={true}
        />
      </Show>
    </Shell>
  )
}

export default function AgentsPage() {
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams<{ startCopilot?: string; showCopilotHighlight?: string }>()

  const [createModalOpen, setCreateModalOpen] = createSignal(false)
  const [editModalOpen, setEditModalOpen] = createSignal(false)
  const [editingAgent, setEditingAgent] = createSignal<Agents[number] | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false)
  const [deletingAgent, setDeletingAgent] = createSignal<Agents[number] | null>(null)
  const storedEnvId = typeof window !== "undefined" ? localStorage.getItem("synatra:agents:environmentId") : null
  const [selectedEnvironmentId, setSelectedEnvironmentId] = createSignal<string | null>(storedEnvId)

  createEffect(() => {
    const id = selectedEnvironmentId()
    if (typeof window !== "undefined" && id) {
      localStorage.setItem("synatra:agents:environmentId", id)
    }
  })

  const agentsQuery = useQuery(() => ({
    queryKey: ["agents"],
    queryFn: async (): Promise<Agents> => {
      const res = await api.api.agents.$get()
      if (!res.ok) throw new Error("Failed to fetch agents")
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

  createEffect(() => {
    const data = environmentsQuery.data
    if (!data || data.length === 0) return
    const current = selectedEnvironmentId()
    const isValid = current && data.some((e) => e.id === current)
    if (!isValid) {
      const production = data.find((e) => e.slug === "production")
      setSelectedEnvironmentId(production?.id ?? data[0].id)
    }
  })

  const selectedAgentFromList = createMemo(() => {
    if (!params.id || !agentsQuery.data) return null
    return agentsQuery.data.find((a) => a.id === params.id) ?? null
  })

  const agentDetailQuery = useQuery(() => {
    const agent = selectedAgentFromList()
    return {
      queryKey: ["agent", agent?.id ?? ""],
      queryFn: async (): Promise<Agent | null> => {
        if (!agent) return null
        const res = await api.api.agents[":id"].$get({ param: { id: agent.id } })
        if (!res.ok) throw new Error("Failed to fetch agent detail")
        return res.json()
      },
      enabled: !!agent,
      placeholderData: () => agent ?? undefined,
    }
  })

  const releasesQuery = useQuery(() => {
    const agent = selectedAgentFromList()
    return {
      queryKey: ["agent", agent?.id ?? "", "releases"],
      queryFn: async (): Promise<AgentReleases> => {
        if (!agent) return []
        const res = await api.api.agents[":id"].releases.$get({ param: { id: agent.id } })
        if (!res.ok) throw new Error("Failed to fetch releases")
        return res.json()
      },
      enabled: !!agent,
    }
  })

  const workingCopyQuery = useQuery(() => {
    const agent = selectedAgentFromList()
    return {
      queryKey: ["agent", agent?.id ?? "", "workingCopy"],
      queryFn: async (): Promise<AgentWorkingCopy | null> => {
        if (!agent) return null
        const res = await api.api.agents[":id"]["working-copy"].$get({ param: { id: agent.id } })
        if (!res.ok) throw new Error("Failed to fetch working copy")
        return res.json()
      },
      enabled: !!agent,
    }
  })

  const createMutate = useMutation(() => ({
    mutationFn: async (data: AgentCreateInput) => {
      const res = await api.api.agents.$post({ json: data })
      if (!res.ok) throw new Error("Failed to create agent")
      return { agent: await res.json(), fromTemplate: !!data.templateId }
    },
    onSuccess: ({ agent, fromTemplate }) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      setCreateModalOpen(false)
      navigate(fromTemplate ? `/agents/${agent.id}?startCopilot=true` : `/agents/${agent.id}`)
    },
  }))

  const updateMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & AgentUpdateInput) => {
      const { id, ...json } = data
      const res = await api.api.agents[":id"].$patch({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to update agent")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      queryClient.invalidateQueries({ queryKey: ["agent", variables.id] })
      setEditModalOpen(false)
      setEditingAgent(null)
    },
  }))

  const deleteMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      const res = await api.api.agents[":id"].$delete({ param: { id } })
      if (!res.ok) throw new Error("Failed to delete agent")
    },
    onSuccess: (_, id) => {
      const agent = deletingAgent()
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      setDeleteModalOpen(false)
      setDeletingAgent(null)
      if (params.id && (!agent || agent.id === params.id)) {
        navigate("/agents")
      }
    },
  }))

  const deployMutate = useMutation(() => ({
    mutationFn: async (data: { agentId: string } & AgentDeployInput) => {
      const { agentId, ...json } = data
      const res = await api.api.agents[":id"].deploy.$post({ param: { id: agentId }, json })
      if (!res.ok) throw new Error("Failed to deploy")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      queryClient.invalidateQueries({ queryKey: ["agent", variables.agentId] })
    },
  }))

  const adoptMutate = useMutation(() => ({
    mutationFn: async (data: { agentId: string; releaseId: string }) => {
      const res = await api.api.agents[":id"].releases[":releaseId"].adopt.$post({
        param: { id: data.agentId, releaseId: data.releaseId },
        json: {},
      })
      if (!res.ok) throw new Error("Failed to adopt release")
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      queryClient.invalidateQueries({ queryKey: ["agent", variables.agentId] })
    },
  }))

  const checkoutMutate = useMutation(() => ({
    mutationFn: async (data: { agentId: string; releaseId: string }) => {
      const res = await api.api.agents[":id"].releases[":releaseId"].checkout.$post({
        param: { id: data.agentId, releaseId: data.releaseId },
        json: {},
      })
      if (!res.ok) throw new Error("Failed to checkout release")
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agent", variables.agentId, "workingCopy"] })
    },
  }))

  const saveWorkingCopyMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & AgentWorkingCopySaveInput) => {
      const { id, ...json } = data
      const res = await api.api.agents[":id"]["working-copy"].save.$post({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to save working copy")
      return res.json()
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(["agent", variables.id, "workingCopy"], {
        agentId: variables.id,
        runtimeConfig: variables.runtimeConfig,
        configHash: result.configHash,
        updatedAt: new Date().toISOString(),
      })
    },
  }))

  const agents = () => agentsQuery.data ?? []
  const environments = () => environmentsQuery.data ?? []

  const recents = () =>
    agents()
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)

  const handleRefresh = async () => {
    const agent = selectedAgentFromList()
    if (agent) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent", agent.id, "releases"] }),
        queryClient.invalidateQueries({ queryKey: ["agent", agent.id, "workingCopy"] }),
      ])
    }
  }

  const handleDeploy = async (
    agentId: string,
    data: { version?: string; bump?: "major" | "minor" | "patch"; description: string },
  ) => {
    await deployMutate.mutateAsync({ agentId, ...data })
  }

  const handleAdopt = async (agentId: string, releaseId: string) => {
    await adoptMutate.mutateAsync({ agentId, releaseId })
  }

  const handleCheckout = async (agentId: string, releaseId: string) => {
    await checkoutMutate.mutateAsync({ agentId, releaseId })
  }

  const handleSaveWorkingCopy = async (id: string, data: { runtimeConfig: AgentRuntimeConfig }) => {
    await saveWorkingCopyMutate.mutateAsync({ id, runtimeConfig: data.runtimeConfig })
  }

  const handleEditClick = (agent: Agents[number]) => {
    setEditingAgent(agent)
    setEditModalOpen(true)
  }

  const handleDeleteClick = (agent: Agents[number]) => {
    setDeletingAgent(agent)
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    const agent = deletingAgent()
    if (agent) await deleteMutate.mutateAsync(agent.id)
  }

  return (
    <>
      <Title>
        {agentDetailQuery.data?.name
          ? `${agentDetailQuery.data.name} | ${activeOrg()?.name ?? "Synatra"}`
          : `Agents | ${activeOrg()?.name ?? "Synatra"}`}
      </Title>
      <Meta name="description" content="Build AI agents that handle work autonomously and generate UI on demand." />
      <BuilderGuard fallback={<PageSkeleton />}>
        <Shell>
          <AgentsSidebar recents={recents()} onCreateClick={() => setCreateModalOpen(true)} />
          <Show
            when={params.id}
            fallback={
              <AgentList
                agents={agents()}
                loading={agentsQuery.isPending}
                onCreateClick={() => setCreateModalOpen(true)}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ["agents"] })}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
              />
            }
          >
            <AgentDetail
              agent={agentDetailQuery.data ?? null}
              agents={agents()}
              releases={releasesQuery.data ?? []}
              workingCopy={workingCopyQuery.data ?? null}
              environments={environments()}
              selectedEnvironmentId={selectedEnvironmentId()}
              loading={agentsQuery.isPending && !agentDetailQuery.data}
              startCopilot={searchParams.startCopilot === "true"}
              onStartCopilotHandled={() => setSearchParams({ startCopilot: undefined })}
              showCopilotHighlight={searchParams.showCopilotHighlight === "true"}
              onCopilotHighlightDismissed={() => setSearchParams({ showCopilotHighlight: undefined })}
              onEdit={() => {
                const agent = selectedAgentFromList()
                if (agent) handleEditClick(agent)
              }}
              onDelete={(id) => {
                const agent = agents().find((a) => a.id === id)
                if (agent) handleDeleteClick(agent)
              }}
              onSaveWorkingCopy={handleSaveWorkingCopy}
              onDeploy={handleDeploy}
              onAdopt={handleAdopt}
              onCheckout={handleCheckout}
              onRefresh={handleRefresh}
              onEnvironmentChange={setSelectedEnvironmentId}
            />
          </Show>
        </Shell>
        <AgentCreateModal
          open={createModalOpen()}
          onClose={() => setCreateModalOpen(false)}
          onSave={async (data) => {
            await createMutate.mutateAsync(data)
          }}
          saving={createMutate.isPending}
          currentAgentCount={agents().length}
        />
        <AgentEditModal
          open={editModalOpen()}
          agent={editingAgent()}
          onClose={() => {
            setEditModalOpen(false)
            setEditingAgent(null)
          }}
          onSave={async (data) => {
            await updateMutate.mutateAsync(data)
          }}
          saving={updateMutate.isPending}
        />
        <AgentDeleteModal
          open={deleteModalOpen()}
          agentName={deletingAgent()?.name ?? ""}
          onClose={() => {
            setDeleteModalOpen(false)
            setDeletingAgent(null)
          }}
          onConfirm={handleDeleteConfirm}
          deleting={deleteMutate.isPending}
        />
      </BuilderGuard>
    </>
  )
}
