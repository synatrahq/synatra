import { createSignal, createMemo, Show } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useParams, useNavigate } from "@solidjs/router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query"
import { api, BuilderGuard, activeOrg } from "../../app"
import { Shell } from "../../components"
import { PromptSidebar } from "./prompt-sidebar"
import { PromptDetail } from "./prompt-detail"
import { PromptCreateModal } from "./prompt-create-modal"
import { PromptDeleteModal } from "./prompt-delete-modal"
import type {
  Prompts,
  Prompt,
  PromptReleases,
  PromptWorkingCopy,
  Agents,
  PromptCreateInput,
  PromptUpdateInput,
  PromptWorkingCopySaveInput,
  PromptDeployInput,
} from "../../app/api"

const noop = () => {}

function PageSkeleton() {
  const params = useParams<{ id?: string }>()
  return (
    <Shell>
      <PromptSidebar prompts={[]} onCreateClick={noop} onDeleteClick={noop} />
      <PromptDetail prompt={null} loading={!!params.id} />
    </Shell>
  )
}

export default function PromptsPage() {
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [createModalOpen, setCreateModalOpen] = createSignal(false)
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false)
  const [deletingPrompt, setDeletingPrompt] = createSignal<{ id: string; name: string } | null>(null)

  const promptsQuery = useQuery(() => ({
    queryKey: ["prompts-list"],
    queryFn: async (): Promise<Prompts> => {
      const res = await api.api.prompts.$get()
      if (!res.ok) throw new Error("Failed to fetch prompts")
      return res.json()
    },
  }))

  const agentsQuery = useQuery(() => ({
    queryKey: ["agents"],
    queryFn: async (): Promise<Agents> => {
      const res = await api.api.agents.$get()
      if (!res.ok) throw new Error("Failed to fetch agents")
      return res.json()
    },
  }))

  const selectedPromptFromList = createMemo(() => {
    if (!params.id || !promptsQuery.data) return null
    return promptsQuery.data.find((p) => p.id === params.id) ?? null
  })

  const promptDetailQuery = useQuery(() => {
    const prompt = selectedPromptFromList()
    return {
      queryKey: ["prompt", prompt?.id ?? ""],
      queryFn: async (): Promise<Prompt | null> => {
        if (!prompt) return null
        const res = await api.api.prompts[":id"].$get({ param: { id: prompt.id } })
        if (!res.ok) throw new Error("Failed to fetch prompt detail")
        return res.json()
      },
      enabled: !!prompt,
    }
  })

  const releasesQuery = useQuery(() => {
    const prompt = selectedPromptFromList()
    return {
      queryKey: ["prompt", prompt?.id ?? "", "releases"],
      queryFn: async (): Promise<PromptReleases> => {
        if (!prompt) return []
        const res = await api.api.prompts[":id"].releases.$get({ param: { id: prompt.id } })
        if (!res.ok) throw new Error("Failed to fetch releases")
        return res.json()
      },
      enabled: !!prompt,
    }
  })

  const workingCopyQuery = useQuery(() => {
    const prompt = selectedPromptFromList()
    return {
      queryKey: ["prompt", prompt?.id ?? "", "workingCopy"],
      queryFn: async (): Promise<PromptWorkingCopy | null> => {
        if (!prompt) return null
        const res = await api.api.prompts[":id"]["working-copy"].$get({ param: { id: prompt.id } })
        if (!res.ok) throw new Error("Failed to fetch working copy")
        return res.json()
      },
      enabled: !!prompt,
    }
  })

  const createMutate = useMutation(() => ({
    mutationFn: async (data: PromptCreateInput) => {
      const res = await api.api.prompts.$post({ json: data })
      if (!res.ok) throw new Error("Failed to create prompt")
      return res.json()
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["prompts-list"] })
      setCreateModalOpen(false)
      navigate(`/prompts/${created.id}`)
    },
  }))

  const deleteMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      const res = await api.api.prompts[":id"].$delete({ param: { id } })
      if (!res.ok) throw new Error("Failed to delete prompt")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts-list"] })
      setDeleteModalOpen(false)
      setDeletingPrompt(null)
      navigate("/prompts")
    },
  }))

  const saveWorkingCopyMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & PromptWorkingCopySaveInput) => {
      const { id, ...json } = data
      const res = await api.api.prompts[":id"]["working-copy"].save.$post({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to save working copy")
      return res.json()
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(["prompt", variables.id, "workingCopy"], {
        promptId: variables.id,
        mode: variables.mode,
        content: variables.content,
        script: variables.script,
        inputSchema: variables.inputSchema,
        contentHash: result.contentHash,
        updatedAt: new Date().toISOString(),
      })
    },
  }))

  const deployMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & PromptDeployInput) => {
      const { id, ...json } = data
      const res = await api.api.prompts[":id"].deploy.$post({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to deploy")
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["prompts-list"] })
      queryClient.invalidateQueries({ queryKey: ["prompt", variables.id] })
    },
  }))

  const adoptMutate = useMutation(() => ({
    mutationFn: async (data: { promptId: string; releaseId: string }) => {
      const res = await api.api.prompts[":id"].releases[":releaseId"].adopt.$post({
        param: { id: data.promptId, releaseId: data.releaseId },
        json: {},
      })
      if (!res.ok) throw new Error("Failed to adopt")
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["prompts-list"] })
      queryClient.invalidateQueries({ queryKey: ["prompt", variables.promptId] })
    },
  }))

  const checkoutMutate = useMutation(() => ({
    mutationFn: async (data: { promptId: string; releaseId: string }) => {
      const res = await api.api.prompts[":id"].releases[":releaseId"].checkout.$post({
        param: { id: data.promptId, releaseId: data.releaseId },
        json: {},
      })
      if (!res.ok) throw new Error("Failed to checkout")
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["prompt", variables.promptId, "workingCopy"] })
    },
  }))

  const updateMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & PromptUpdateInput) => {
      const { id, ...json } = data
      const res = await api.api.prompts[":id"].$patch({ param: { id }, json })
      if (!res.ok) throw new Error("Failed to update")
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["prompts-list"] })
      navigate(`/prompts/${updated.id}`)
    },
  }))

  const prompts = () => promptsQuery.data ?? []

  const openDeleteModal = (prompt: { id: string; name: string }) => {
    setDeletingPrompt(prompt)
    setDeleteModalOpen(true)
  }

  const sortedAgents = () => {
    const order = new Map<string, number>()
    prompts().forEach((p, i) => {
      if (!order.has(p.agentId)) order.set(p.agentId, i)
    })
    return [...(agentsQuery.data ?? [])].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
  }

  return (
    <>
      <Title>
        {promptDetailQuery.data?.name
          ? `${promptDetailQuery.data.name} | ${activeOrg()?.name ?? "Synatra"}`
          : `Prompts | ${activeOrg()?.name ?? "Synatra"}`}
      </Title>
      <Meta name="description" content="Create prompt templates that guide AI agents through complex workflows." />
      <BuilderGuard fallback={<PageSkeleton />}>
        <Shell>
          <PromptSidebar
            prompts={prompts()}
            onCreateClick={() => setCreateModalOpen(true)}
            onDeleteClick={openDeleteModal}
          />
          <Show when={params.id && promptDetailQuery.data} fallback={<PromptDetail prompt={null} loading={false} />}>
            <PromptDetail
              prompt={promptDetailQuery.data ?? null}
              loading={promptsQuery.isPending && !promptDetailQuery.data}
              releases={releasesQuery.data ?? []}
              workingCopy={workingCopyQuery.data ?? null}
              onDelete={(id) => {
                const p = promptDetailQuery.data
                if (p?.id === id) openDeleteModal(p)
              }}
              onSaveWorkingCopy={async (id, data) => {
                await saveWorkingCopyMutate.mutateAsync({ id, ...data })
              }}
              onDeploy={async (id, bump, description) => {
                await deployMutate.mutateAsync({ id, bump, description })
              }}
              onAdopt={async (promptId, releaseId) => {
                await adoptMutate.mutateAsync({ promptId, releaseId })
              }}
              onCheckout={async (promptId, releaseId) => {
                await checkoutMutate.mutateAsync({ promptId, releaseId })
              }}
              onUpdatePrompt={async (id, data) => {
                await updateMutate.mutateAsync({ id, ...data })
              }}
            />
          </Show>
        </Shell>
        <PromptCreateModal
          open={createModalOpen()}
          agents={sortedAgents()}
          onClose={() => setCreateModalOpen(false)}
          onSave={async (data) => {
            await createMutate.mutateAsync(data)
          }}
          saving={createMutate.isPending}
        />
        <PromptDeleteModal
          open={deleteModalOpen()}
          promptName={deletingPrompt()?.name ?? ""}
          onClose={() => {
            setDeleteModalOpen(false)
            setDeletingPrompt(null)
          }}
          onConfirm={async () => {
            const p = deletingPrompt()
            if (p) await deleteMutate.mutateAsync(p.id)
          }}
          deleting={deleteMutate.isPending}
        />
      </BuilderGuard>
    </>
  )
}
