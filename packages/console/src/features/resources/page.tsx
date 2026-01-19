import { createSignal, createEffect, createMemo, Show } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useParams, useNavigate, useSearchParams } from "@solidjs/router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query"
import {
  type ResourceType,
  type ManagedResourceType,
  type InputResourceConfig,
  type ConnectionMode,
  ManagedResourceType as ManagedTypes,
} from "@synatra/core/types"
import { api, BuilderGuard, activeOrg } from "../../app"
import type {
  Resource,
  Resources,
  Environments,
  Connectors,
  AppAccounts,
  ResourceCreateInput,
  ResourceUpdateInput,
  ResourceConfigCreateInput,
  ConnectorCreateInput,
} from "../../app/api"
import { Shell } from "../../components"
import { ResourcesSidebar } from "./resources-sidebar"
import { ResourceDetail, type TestConnectionResult } from "./resource-detail"
import { ResourceCreateModal } from "./resource-create-modal"
import { ResourceDeleteModal } from "./resource-delete-modal"
import { AppConnectModal } from "../settings/app-connect-modal"
import { ConnectorCreateModal } from "../settings/connector-create-modal"

const noop = () => {}

function PageSkeleton() {
  const params = useParams<{ id?: string }>()
  return (
    <Shell>
      <ResourcesSidebar resources={[]} onCreateClick={noop} onDeleteClick={noop} />
      <ResourceDetail resource={null} environments={[]} connectors={[]} appAccounts={[]} loading={!!params.id} />
    </Shell>
  )
}

export default function ResourcesPage() {
  const params = useParams<{ id?: string }>()
  const [searchParams, setSearchParams] = useSearchParams<{
    newAppAccountId?: string
    returnTo?: string
    agentId?: string
    requestId?: string
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const returnContext = createMemo(() => {
    const returnTo = searchParams.returnTo
    const agentId = searchParams.agentId
    const requestId = searchParams.requestId
    if (returnTo === "agent" && agentId && requestId) {
      return { agentId, requestId }
    }
    return null
  })

  const handleReturnToCopilot = () => {
    const ctx = returnContext()
    const resourceId = params.id
    if (ctx && resourceId) {
      navigate(`/agents/${ctx.agentId}?completeResourceRequest=${ctx.requestId}&resourceId=${resourceId}`)
    }
  }

  const [createModalOpen, setCreateModalOpen] = createSignal(false)
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false)
  const [deletingResource, setDeletingResource] = createSignal<{ id: string; name: string } | null>(null)
  const [appConnectModalOpen, setAppConnectModalOpen] = createSignal(false)
  const [connectingAppId, setConnectingAppId] = createSignal<string | null>(null)
  const [appConnecting, setAppConnecting] = createSignal(false)
  const [pendingAppAccountId, setPendingAppAccountId] = createSignal<string | null>(null)
  const [connectorCreateModalOpen, setConnectorCreateModalOpen] = createSignal(false)
  const [newConnectorToken, setNewConnectorToken] = createSignal<{ name: string; token: string } | null>(null)
  const [pendingConnectorId, setPendingConnectorId] = createSignal<string | null>(null)

  const resourcesQuery = useQuery(() => ({
    queryKey: ["resources", activeOrg()?.id],
    queryFn: async (): Promise<Resources> => {
      const res = await api.api.resources.$get()
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

  const connectorsQuery = useQuery(() => ({
    queryKey: ["connectors", activeOrg()?.id],
    queryFn: async (): Promise<Connectors> => {
      const res = await api.api.connectors.$get()
      return res.json()
    },
    refetchInterval: 5000,
    enabled: !!activeOrg()?.id,
  }))

  const appAccountsQuery = useQuery(() => ({
    queryKey: ["app-accounts", activeOrg()?.id],
    queryFn: async (): Promise<AppAccounts> => {
      const res = await api.api["app-accounts"].$get()
      return res.json()
    },
    enabled: !!activeOrg()?.id,
  }))

  const selectedResourceFromList = createMemo(() => {
    if (!params.id || !resourcesQuery.data) return null
    return resourcesQuery.data.find((r) => r.id === params.id) ?? null
  })

  const resourceDetailQuery = useQuery(() => {
    const resource = selectedResourceFromList()
    return {
      queryKey: ["resource", resource?.id ?? ""],
      queryFn: async (): Promise<Resource | null> => {
        if (!resource) return null
        const res = await api.api.resources[":id"].$get({ param: { id: resource.id } })
        return res.json()
      },
      enabled: !!resource,
      placeholderData: () => resource ?? undefined,
    }
  })

  const [refetchedForId, setRefetchedForId] = createSignal<string | null>(null)

  createEffect(() => {
    if (!params.id) {
      setRefetchedForId(null)
    }
  })

  createEffect(() => {
    const id = params.id
    if (id && resourcesQuery.data && !selectedResourceFromList() && refetchedForId() !== id) {
      setRefetchedForId(id)
      queryClient.invalidateQueries({ queryKey: ["resources"] })
    }
  })

  const createMutate = useMutation(() => ({
    mutationFn: async (data: ResourceCreateInput) => {
      const res = await api.api.resources.$post({ json: { ...data, configs: [] } })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] })
    },
  }))

  const deleteMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      await api.api.resources[":id"].$delete({ param: { id } })
    },
    onSuccess: (_, id) => {
      const wasSelected = selectedResourceFromList()?.id === id
      queryClient.invalidateQueries({ queryKey: ["resources"] })
      setDeleteModalOpen(false)
      setDeletingResource(null)
      if (wasSelected) {
        navigate("/resources")
      }
    },
  }))

  const updateMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & ResourceUpdateInput) => {
      const { id, ...json } = data
      const res = await api.api.resources[":id"].$patch({ param: { id }, json })
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["resources"] })
      queryClient.invalidateQueries({ queryKey: ["resource", updated.id] })
      if (updated.id !== params.id) {
        navigate(`/resources/${updated.id}`)
      }
    },
  }))

  const saveConfigMutate = useMutation(() => ({
    mutationFn: async (data: { resourceId: string; changes: ResourceConfigCreateInput[]; deletions: string[] }) => {
      for (const environmentId of data.deletions) {
        await api.api.resources[":id"].config.$delete({
          param: { id: data.resourceId },
          json: { environmentId },
        })
      }
      for (const change of data.changes) {
        await api.api.resources[":id"].config.$post({ param: { id: data.resourceId }, json: change })
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["resources"] })
      queryClient.invalidateQueries({ queryKey: ["resource", variables.resourceId] })
    },
  }))

  const connectorCreateMutate = useMutation(() => ({
    mutationFn: async (data: ConnectorCreateInput) => {
      const res = await api.api.connectors.$post({ json: data })
      return res.json()
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["connectors"] })
      setConnectorCreateModalOpen(false)
      setNewConnectorToken({ name: result.connector.name, token: result.token })
      setPendingConnectorId(result.connector.id)
    },
  }))

  createEffect(() => {
    const param = searchParams.newAppAccountId
    const newAppAccountId = Array.isArray(param) ? param[0] : param
    if (newAppAccountId) {
      setPendingAppAccountId(newAppAccountId)
      setSearchParams({ newAppAccountId: undefined }, { replace: true })
      queryClient.invalidateQueries({ queryKey: ["app-accounts"] })
      if (!params.id) {
        setCreateModalOpen(true)
      }
    }
  })

  const resources = () => resourcesQuery.data ?? []
  const environments = () => environmentsQuery.data ?? []
  const connectors = () => connectorsQuery.data ?? []
  const appAccounts = () => appAccountsQuery.data ?? []

  const handleAppConnect = (appId: string) => {
    setCreateModalOpen(false)
    setConnectingAppId(appId)
    setAppConnectModalOpen(true)
  }

  const handleAppConnectConfirm = async (appId: string, name: string) => {
    setAppConnecting(true)
    try {
      const url = new URL(params.id ? `/resources/${params.id}` : "/resources", window.location.origin)
      if (searchParams.returnTo) url.searchParams.set("returnTo", searchParams.returnTo)
      if (searchParams.agentId) url.searchParams.set("agentId", searchParams.agentId)
      if (searchParams.requestId) url.searchParams.set("requestId", searchParams.requestId)
      const returnUrl = url.toString()

      if (appId === "github") {
        const res = await api.api["app-accounts"].github.start.$post({ json: { name, returnUrl } })
        if (res.ok) {
          const data = await res.json()
          window.location.href = data.url
          return
        }
      } else if (appId === "intercom") {
        const res = await api.api["app-accounts"].oauth.start.$post({ json: { appId: "intercom", name, returnUrl } })
        if (res.ok) {
          const data = await res.json()
          window.location.href = data.authUrl
          return
        }
      }
    } finally {
      setAppConnecting(false)
    }
    setAppConnectModalOpen(false)
    alert("Failed to start app connection. Please try again.")
  }

  const handleDeleteClick = (resource: Resources[number]) => {
    setDeletingResource({ id: resource.id, name: resource.name })
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    const resource = deletingResource()
    if (resource) await deleteMutate.mutateAsync(resource.id)
  }

  const handleDelete = async (id: string) => {
    const resource = resources().find((r) => r.id === id)
    if (resource) handleDeleteClick(resource)
  }

  const handleCreate = async (data: ResourceCreateInput & { appAccountId?: string }) => {
    const { appAccountId, ...resourceData } = data
    const created = await createMutate.mutateAsync(resourceData)

    if ((data.type === "github" || data.type === "intercom") && appAccountId) {
      const defaultEnv = environmentsQuery.data?.[0]
      if (defaultEnv) {
        await saveConfigMutate.mutateAsync({
          resourceId: created.id,
          changes: [
            {
              environmentId: defaultEnv.id,
              config: { appAccountId },
              connectionMode: "direct",
              connectorId: null,
            },
          ],
          deletions: [],
        })
        await queryClient.refetchQueries({ queryKey: ["resources"] })
      }
    }

    setCreateModalOpen(false)
    navigate(`/resources/${created.id}`)
  }

  const handleSave = async (
    resourceId: string,
    changes: {
      environmentId: string
      config: InputResourceConfig
      connectionMode: ConnectionMode
      connectorId: string | null
    }[],
    deletions: string[],
  ) => {
    await saveConfigMutate.mutateAsync({ resourceId, changes, deletions })
  }

  const handleUpdateResource = async (id: string, data: { name?: string; slug?: string; description?: string }) => {
    await updateMutate.mutateAsync({ id, ...data })
  }

  const handleTestConnection = async (testParams: {
    type: ResourceType
    config: InputResourceConfig
    resourceId?: string
    environmentId?: string
    connectionMode?: ConnectionMode
    connectorId?: string | null
  }): Promise<TestConnectionResult> => {
    if (ManagedTypes.includes(testParams.type as ManagedResourceType)) {
      return { success: false, error: "Test connection not supported for this resource type" }
    }
    try {
      const res = await api.api.resources["test-connection"].$post({
        json: { ...testParams, type: testParams.type as Exclude<ResourceType, ManagedResourceType> },
      })
      if (res.ok) {
        const data = await res.json()
        return { success: data.success, error: data.error }
      }
      return { success: false, error: "Request failed" }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" }
    }
  }

  return (
    <>
      <Title>
        {resourceDetailQuery.data?.name
          ? `${resourceDetailQuery.data.name} | ${activeOrg()?.name ?? "Synatra"}`
          : `Resources | ${activeOrg()?.name ?? "Synatra"}`}
      </Title>
      <Meta
        name="description"
        content="Connect PostgreSQL, MySQL, Stripe, GitHub, Intercom, and more to your AI agents."
      />
      <BuilderGuard fallback={<PageSkeleton />}>
        <Shell>
          <ResourcesSidebar
            resources={resources()}
            onCreateClick={() => setCreateModalOpen(true)}
            onDeleteClick={handleDeleteClick}
          />
          <Show
            when={params.id && resourceDetailQuery.data}
            fallback={
              <ResourceDetail
                resource={null}
                environments={[]}
                connectors={[]}
                appAccounts={[]}
                loading={!!params.id && (resourcesQuery.isPending || resourceDetailQuery.isPending)}
              />
            }
          >
            <ResourceDetail
              resource={resourceDetailQuery.data ?? null}
              environments={environments()}
              connectors={connectors()}
              appAccounts={appAccounts()}
              pendingAppAccountId={pendingAppAccountId()}
              pendingConnectorId={pendingConnectorId()}
              newConnectorToken={newConnectorToken()}
              loading={false}
              saving={updateMutate.isPending || saveConfigMutate.isPending}
              onDelete={handleDelete}
              onSave={handleSave}
              onTestConnection={handleTestConnection}
              onUpdateResource={handleUpdateResource}
              onAppConnect={handleAppConnect}
              onConnectorCreate={() => setConnectorCreateModalOpen(true)}
              onConnectorTokenDismiss={() => {
                setNewConnectorToken(null)
                setPendingConnectorId(null)
              }}
              returnContext={returnContext()}
              onReturnToCopilot={handleReturnToCopilot}
            />
          </Show>
        </Shell>
        <ResourceCreateModal
          open={createModalOpen()}
          onClose={() => setCreateModalOpen(false)}
          onSave={handleCreate}
          saving={createMutate.isPending || saveConfigMutate.isPending}
          appAccounts={appAccounts()}
          pendingAppAccountId={pendingAppAccountId()}
          onAppConnect={handleAppConnect}
        />
        <ResourceDeleteModal
          open={deleteModalOpen()}
          resourceName={deletingResource()?.name ?? ""}
          onClose={() => {
            setDeleteModalOpen(false)
            setDeletingResource(null)
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
          onConnect={handleAppConnectConfirm}
          connecting={appConnecting()}
        />
        <ConnectorCreateModal
          open={connectorCreateModalOpen()}
          onClose={() => setConnectorCreateModalOpen(false)}
          onSave={async (data) => {
            await connectorCreateMutate.mutateAsync(data)
          }}
          saving={connectorCreateMutate.isPending}
        />
      </BuilderGuard>
    </>
  )
}
