import { Show, createSignal, createEffect, on, createMemo } from "solid-js"
import {
  isConnectionTestable,
  type ResourceType,
  type InputResourceConfig,
  type InputPostgresConfig,
  type InputMysqlConfig,
  type InputStripeConfig,
  type InputGitHubConfig,
  type InputRestApiConfig,
  type APIResourceConfig,
  type APIPostgresConfig,
  type APIMysqlConfig,
  type APIStripeConfig,
  type APIGitHubConfig,
  type APIRestApiConfig,
  type ConnectionMode,
  type LlmProvider,
} from "@synatra/core/types"
import { api } from "../../../app"
import {
  Button,
  Skeleton,
  SkeletonText,
  Spinner,
  Modal,
  ModalContainer,
  ModalBody,
  ModalFooter,
  Input,
  Textarea,
} from "../../../ui"
import { ResourceIconContainer } from "../../../components"
import { Database, PencilSimple, Plugs } from "phosphor-solid-js"
import { OutlinePanel } from "./outline-panel"
import { InspectorPanel } from "./inspector-panel"
import type { Selection, SaveStatus, Tab, EditableConfigState } from "./constants"
import type { Resources, Environments, Connectors, AppAccounts } from "../../../app/api"
import { createEditorState, hasEditorChanges, editorStateToInputConfig } from "./constants"

export type TestConnectionResult = { success: boolean; error?: string }

export type ResourceDetailProps = {
  resource: Resources[number] | null
  environments: Environments
  connectors: Connectors
  appAccounts?: AppAccounts
  pendingAppAccountId?: string | null
  pendingConnectorId?: string | null
  loading?: boolean
  saving?: boolean
  onDelete?: (id: string) => void
  onSave?: (
    resourceId: string,
    changes: {
      environmentId: string
      config: InputResourceConfig
      connectionMode: ConnectionMode
      connectorId: string | null
    }[],
    deletions: string[],
  ) => Promise<void>
  onTestConnection?: (params: {
    type: ResourceType
    config: InputResourceConfig
    resourceId?: string
    environmentId?: string
    connectionMode?: ConnectionMode
    connectorId?: string | null
  }) => Promise<TestConnectionResult>
  onUpdateResource?: (id: string, data: { name?: string; slug?: string; description?: string }) => Promise<void>
  onAppConnect?: (appId: string) => void
  onConnectorCreate?: () => void
  newConnectorToken?: { name: string; token: string } | null
  onConnectorTokenDismiss?: () => void
  returnContext?: { agentId: string; requestId: string } | null
  onReturnToCopilot?: () => void
}

function createDefaultAPIConfig(type: string): APIResourceConfig {
  if (type === "postgres" || type === "mysql") {
    return {
      host: "",
      port: type === "mysql" ? 3306 : 5432,
      database: "",
      user: "",
      password: "",
      ssl: false,
      sslVerification: "full",
      caCertificate: null,
      caCertificateFilename: null,
      clientCertificate: null,
      clientCertificateFilename: null,
      clientKey: null,
      clientKeyFilename: null,
    } as APIPostgresConfig | APIMysqlConfig
  }
  if (type === "github") {
    return {
      appAccountId: "",
    } as APIGitHubConfig
  }
  if (type === "restapi") {
    return {
      baseUrl: "",
      authType: "none",
      authConfig: "",
      authUsername: "",
      headers: {},
      queryParams: {},
    } as APIRestApiConfig
  }
  return {
    apiKey: "",
    apiVersion: "2025-12-15.clover",
  } as APIStripeConfig
}

function createDefaultInputConfig(type: string): InputResourceConfig {
  if (type === "postgres") {
    return {
      host: "",
      port: 5432,
      database: "",
      user: "",
      password: "",
      ssl: false,
      sslVerification: "full",
      caCertificate: null,
      clientCertificate: null,
      clientKey: null,
    } as InputPostgresConfig
  }
  if (type === "mysql") {
    return {
      host: "",
      port: 3306,
      database: "",
      user: "",
      password: "",
      ssl: false,
      sslVerification: "full",
      caCertificate: null,
      clientCertificate: null,
      clientKey: null,
    } as InputMysqlConfig
  }
  if (type === "github") {
    return {
      appAccountId: "",
    } as InputGitHubConfig
  }
  if (type === "restapi") {
    return {
      baseUrl: "",
      auth: { type: "none" },
      headers: {},
      queryParams: {},
    } as InputRestApiConfig
  }
  return {
    apiKey: "",
    apiVersion: "2025-12-15.clover",
  } as InputStripeConfig
}

function LoadingState() {
  return (
    <div class="flex flex-1 flex-col">
      <div class="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton class="h-6 w-6 rounded-md" />
        <Skeleton class="h-4 w-32" />
      </div>
      <div class="flex-1 p-4">
        <div class="space-y-4">
          <Skeleton class="h-8 w-48" />
          <SkeletonText lines={3} />
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-text-muted">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">
          <Database class="h-7 w-7 opacity-40" />
        </div>
        <p class="text-sm">Select a resource to view details</p>
      </div>
    </div>
  )
}

export function ResourceDetail(props: ResourceDetailProps) {
  const [activeTab, setActiveTab] = createSignal<Tab>("configuration")
  const [selection, setSelection] = createSignal<Selection | null>(null)
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("idle")
  const [editModalOpen, setEditModalOpen] = createSignal(false)
  const [editedName, setEditedName] = createSignal("")
  const [editedSlug, setEditedSlug] = createSignal("")
  const [editedDescription, setEditedDescription] = createSignal("")

  // Editor states per environment (preserves state when switching environments)
  const [editStates, setEditStates] = createSignal<Map<string, EditableConfigState>>(new Map())
  const [newConfigs, setNewConfigs] = createSignal<Resources[number]["configs"][number][]>([])
  const [deletedEnvIds, setDeletedEnvIds] = createSignal<Set<string>>(new Set())
  const [savingAndReturning, setSavingAndReturning] = createSignal(false)
  const [returnError, setReturnError] = createSignal<string | null>(null)
  const [testing, setTesting] = createSignal(false)
  const [testResult, setTestResult] = createSignal<TestConnectionResult | null>(null)
  const [llmValidationErrors, setLlmValidationErrors] = createSignal<Partial<Record<LlmProvider, string>>>({})

  // Get or create editor state for an environment
  const getEditState = (environmentId: string): EditableConfigState | undefined => {
    const existing = editStates().get(environmentId)
    if (existing) return existing

    // Find the config for this environment
    const config =
      props.resource?.configs.find((c) => c.environmentId === environmentId) ??
      newConfigs().find((c) => c.environmentId === environmentId)
    if (!config || !props.resource) return undefined

    // Create initial state
    return createEditorState(props.resource.type, config.config, config.connectionMode, config.connectorId)
  }

  // Calculate which environments have unsaved changes
  const unsavedEnvIds = createMemo(() => {
    const result = new Set<string>()
    if (!props.resource) return result

    for (const [envId, editState] of editStates().entries()) {
      // Find original config
      const originalConfig =
        props.resource.configs.find((c) => c.environmentId === envId) ??
        newConfigs().find((c) => c.environmentId === envId)
      if (!originalConfig) continue

      if (
        hasEditorChanges(
          props.resource.type,
          editState,
          originalConfig.config,
          originalConfig.connectionMode,
          originalConfig.connectorId,
        )
      ) {
        result.add(envId)
      }
    }

    // New configs are always considered as having changes
    for (const newConfig of newConfigs()) {
      result.add(newConfig.environmentId)
    }

    return result
  })

  const hasChanges = () => unsavedEnvIds().size > 0 || deletedEnvIds().size > 0

  createEffect(
    on(
      () => props.resource?.id,
      (id, prevId) => {
        if (id !== prevId) {
          setEditStates(new Map())
          setDeletedEnvIds(new Set<string>())
          setSaveStatus("idle")
          setNewConfigs([])
          setTestResult(null)

          const firstConfig = props.resource?.configs[0]
          if (firstConfig) {
            setSelection({ type: "environment", environmentId: firstConfig.environmentId })
          } else {
            setSelection(null)
          }
        }
      },
    ),
  )

  createEffect(
    on(
      () => selection()?.environmentId,
      () => {
        setTestResult(null)
        setTesting(false)
      },
    ),
  )

  createEffect(
    on(
      () => [props.resource?.id, props.environments.length, props.resource?.configs.length] as const,
      ([resourceId, envCount, configCount]) => {
        if (resourceId && configCount === 0 && newConfigs().length === 0 && envCount > 0) {
          const productionEnv = props.environments.find((e) => e.slug === "production")
          if (productionEnv && props.resource) {
            const newConfig: Resources[number]["configs"][number] = {
              id: `new-${productionEnv.id}`,
              environmentId: productionEnv.id,
              environmentName: productionEnv.name,
              environmentSlug: productionEnv.slug,
              environmentColor: productionEnv.color,
              config: createDefaultAPIConfig(props.resource.type),
              connectionMode: "direct",
              connectorId: null,
            }
            setNewConfigs([newConfig])
            setSelection({ type: "environment", environmentId: productionEnv.id })
          }
        }
      },
    ),
  )

  createEffect(() => {
    const pending = props.pendingAppAccountId
    const sel = selection()
    const type = props.resource?.type
    const isAppResource = type === "github" || type === "intercom"
    if (pending && sel && isAppResource && props.appAccounts?.some((a) => a.id === pending)) {
      setEditStates((prev) => {
        const next = new Map(prev)
        const currentState = prev.get(sel.environmentId)
        const config =
          props.resource?.configs.find((c) => c.environmentId === sel.environmentId) ??
          newConfigs().find((c) => c.environmentId === sel.environmentId)
        const baseState =
          currentState ??
          (config && props.resource
            ? createEditorState(props.resource.type, config.config, config.connectionMode, config.connectorId)
            : null)
        if (baseState) {
          if (type === "github") {
            next.set(sel.environmentId, {
              ...baseState,
              github: { appAccountId: pending },
            })
          } else if (type === "intercom") {
            next.set(sel.environmentId, {
              ...baseState,
              intercom: { appAccountId: pending },
            })
          }
        }
        return next
      })
    }
  })

  const getEffectiveConfigs = (): Resources[number]["configs"][number][] => {
    if (!props.resource) return []
    const deleted = deletedEnvIds()
    const existingConfigs = props.resource.configs.filter((c) => !deleted.has(c.environmentId))
    return [...existingConfigs, ...newConfigs()]
  }

  const handleEditStateChange = (environmentId: string, editState: EditableConfigState) => {
    setEditStates((prev) => {
      const next = new Map(prev)
      next.set(environmentId, editState)
      return next
    })
  }

  const collectChanges = () => {
    if (!props.resource) return []
    const changes: {
      environmentId: string
      config: InputResourceConfig
      connectionMode: ConnectionMode
      connectorId: string | null
    }[] = []
    const deleted = deletedEnvIds()

    for (const envId of unsavedEnvIds()) {
      if (deleted.has(envId)) continue
      const editState = editStates().get(envId)
      if (!editState) {
        const isNew = newConfigs().some((c) => c.environmentId === envId)
        if (isNew) {
          changes.push({
            environmentId: envId,
            config: createDefaultInputConfig(props.resource.type),
            connectionMode: "direct",
            connectorId: null,
          })
        }
        continue
      }
      changes.push({
        environmentId: envId,
        config: editorStateToInputConfig(props.resource.type, editState),
        connectionMode: editState.connectionMode,
        connectorId: editState.connectorId,
      })
    }
    return changes
  }

  const collectDeletions = () => {
    return Array.from(deletedEnvIds()).filter((envId) => props.resource?.configs.some((c) => c.environmentId === envId))
  }

  const clearEditState = () => {
    setEditStates(new Map())
    setNewConfigs([])
    setDeletedEnvIds(new Set<string>())
  }

  const validateLlmKeys = async (
    providers: { provider: LlmProvider; apiKey: string; baseUrl: string | null }[],
  ): Promise<{ provider: LlmProvider; apiKey: string; valid: boolean; error?: string }[]> => {
    if (providers.length === 0) return []
    const res = await api.api.resources["validate-llm-keys"].$post({ json: { providers } })
    if (!res.ok) {
      return providers.map((p) => ({ ...p, valid: false, error: "Validation request failed" }))
    }
    return res.json()
  }

  const handleSave = async () => {
    if (!props.resource || !props.onSave || !hasChanges()) return

    setLlmValidationErrors({})
    setSaveStatus("saving")

    try {
      if (props.resource.type === "synatra_ai") {
        const seen = new Set<string>()
        const toValidate = [...unsavedEnvIds()].flatMap((envId) => {
          const ai = editStates().get(envId)?.synatraAi
          if (!ai) return []
          return (["openai", "anthropic", "google"] as LlmProvider[]).flatMap((provider) => {
            const config = ai[provider]
            const key = config.apiKey?.trim()
            if (!key) return []
            const dedupeKey = `${provider}:${key}:${config.baseUrl ?? ""}`
            if (seen.has(dedupeKey)) return []
            seen.add(dedupeKey)
            return [{ provider, apiKey: key, baseUrl: config.baseUrl }]
          })
        })

        const results = await validateLlmKeys(toValidate)
        const failed = results.filter((r) => !r.valid)
        if (failed.length > 0) {
          setLlmValidationErrors(Object.fromEntries(failed.map((r) => [r.provider, r.error || "Invalid API key"])))
          setSaveStatus("error")
          return
        }
      }

      await props.onSave(props.resource.id, collectChanges(), collectDeletions())
      clearEditState()
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch {
      setSaveStatus("error")
    }
  }

  const handleToggleLlmEnabled = async (provider: LlmProvider, enabled: boolean) => {
    if (!props.resource || !props.onSave) return

    const envId = selection()?.environmentId
    if (!envId) return

    const editState = getEditState(envId)
    if (!editState?.synatraAi) return

    const config: Record<string, { enabled: boolean }> = {
      openai: { enabled: editState.synatraAi.openai.enabled },
      anthropic: { enabled: editState.synatraAi.anthropic.enabled },
      google: { enabled: editState.synatraAi.google.enabled },
    }
    config[provider] = { enabled }

    try {
      await props.onSave(
        props.resource.id,
        [{ environmentId: envId, config, connectionMode: "direct", connectorId: null }],
        [],
      )
    } catch {
      // Revert the local state on error
      handleEditStateChange(envId, {
        ...editState,
        synatraAi: {
          ...editState.synatraAi,
          [provider]: { ...editState.synatraAi[provider], enabled: !enabled },
        },
      })
    }
  }

  const handleTestConnection = async () => {
    if (!props.resource || !props.onTestConnection) return

    const envId = selection()?.environmentId
    if (!envId) return

    const editState = getEditState(envId)
    if (!editState) return

    setTesting(true)
    setTestResult(null)

    try {
      const config = editorStateToInputConfig(props.resource.type, editState)
      const isNew = newConfigs().some((c) => c.environmentId === envId)
      const result = await props.onTestConnection({
        type: props.resource.type,
        config,
        resourceId: isNew ? undefined : props.resource.id,
        environmentId: isNew ? undefined : envId,
        connectionMode: editState.connectionMode,
        connectorId: editState.connectorId,
      })
      setTestResult(result)
    } catch (e) {
      setTestResult({ success: false, error: e instanceof Error ? e.message : "Unknown error" })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveAndReturn = async () => {
    if (!props.resource || !props.onTestConnection || !props.onReturnToCopilot) return

    setReturnError(null)
    setSavingAndReturning(true)

    try {
      const testEnvId =
        selection()?.environmentId ??
        newConfigs()[0]?.environmentId ??
        props.resource.configs[0]?.environmentId ??
        props.environments[0]?.id

      if (!testEnvId) {
        setReturnError("No environment configured")
        return
      }

      const editState = getEditState(testEnvId)
      const config = editState
        ? editorStateToInputConfig(props.resource.type, editState)
        : createDefaultInputConfig(props.resource.type)

      const result = await props.onTestConnection({
        type: props.resource.type,
        config,
        resourceId: props.resource.id,
        environmentId: testEnvId,
        connectionMode: editState?.connectionMode ?? "direct",
        connectorId: editState?.connectorId ?? null,
      })

      if (!result.success) {
        setReturnError(result.error ?? "Connection test failed")
        return
      }

      if (hasChanges() && props.onSave) {
        await props.onSave(props.resource.id, collectChanges(), collectDeletions())
        clearEditState()
      }

      props.onReturnToCopilot()
    } catch (e) {
      setReturnError(e instanceof Error ? e.message : "An error occurred")
    } finally {
      setSavingAndReturning(false)
    }
  }

  const handleAddEnvironment = (environmentId: string) => {
    if (!props.resource) return

    const env = props.environments.find((e) => e.id === environmentId)
    if (!env) return

    const newConfig: Resources[number]["configs"][number] = {
      id: `new-${environmentId}`,
      environmentId: env.id,
      environmentName: env.name,
      environmentSlug: env.slug,
      environmentColor: env.color,
      config: createDefaultAPIConfig(props.resource.type),
      connectionMode: "direct",
      connectorId: null,
    }

    setNewConfigs((prev) => [...prev, newConfig])
    setSelection({ type: "environment", environmentId })
  }

  const handleRemoveEnvironment = (environmentId: string) => {
    const isNewConfig = newConfigs().some((c) => c.environmentId === environmentId)

    if (isNewConfig) {
      setNewConfigs((prev) => prev.filter((c) => c.environmentId !== environmentId))
    } else {
      setDeletedEnvIds((prev) => {
        const next = new Set(prev)
        next.add(environmentId)
        return next
      })
    }

    setEditStates((prev) => {
      const next = new Map(prev)
      next.delete(environmentId)
      return next
    })

    if (selection()?.environmentId === environmentId) {
      const remaining = getEffectiveConfigs().filter((c) => c.environmentId !== environmentId)
      if (remaining.length > 0) {
        setSelection({ type: "environment", environmentId: remaining[0].environmentId })
      } else {
        setSelection(null)
      }
    }
  }

  const openEditModal = () => {
    if (!props.resource) return
    setEditedName(props.resource.name)
    setEditedSlug(props.resource.slug)
    setEditedDescription(props.resource.description ?? "")
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!props.resource || !props.onUpdateResource) return
    const name = editedName().trim()
    const slug = editedSlug().trim()
    const description = editedDescription().trim()
    if (!name || !slug) {
      setEditModalOpen(false)
      return
    }
    const changes: { name?: string; slug?: string; description?: string } = {}
    if (name !== props.resource.name) changes.name = name
    if (slug !== props.resource.slug) changes.slug = slug
    if (description !== (props.resource.description ?? "")) changes.description = description
    if (Object.keys(changes).length === 0) {
      setEditModalOpen(false)
      return
    }
    await props.onUpdateResource(props.resource.id, changes)
    setEditModalOpen(false)
  }

  const slugChanged = () => editedSlug().trim() !== props.resource?.slug

  return (
    <div class="flex flex-1 flex-col overflow-hidden bg-surface-elevated">
      <Show when={props.loading}>
        <LoadingState />
      </Show>
      <Show when={!props.loading && !props.resource}>
        <EmptyState />
      </Show>
      <Show when={!props.loading && props.resource}>
        {(resource) => {
          return (
            <>
              {/* Header */}
              <div class="flex items-center justify-between border-b border-border px-3 py-2">
                <div class="flex items-center gap-2">
                  <ResourceIconContainer type={resource().type} />
                  <Show
                    when={!resource().managed}
                    fallback={<span class="text-xs font-medium text-text">{resource().name}</span>}
                  >
                    <button
                      type="button"
                      class="group -mx-1.5 flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-muted"
                      onClick={openEditModal}
                    >
                      {resource().name}
                      <PencilSimple class="h-3 w-3 text-text-muted opacity-0 group-hover:opacity-100" />
                    </button>
                  </Show>
                </div>
                <div class="flex items-center gap-2">
                  <Show when={!props.returnContext && saveStatus() === "saved"}>
                    <span class="text-2xs text-success">Saved</span>
                  </Show>
                  <Show when={!props.returnContext && saveStatus() === "error"}>
                    <span class="text-2xs text-danger">Save failed</span>
                  </Show>
                  <Show when={returnError()}>
                    <span class="text-2xs text-danger">{returnError()}</span>
                  </Show>
                  <Show
                    when={props.returnContext && props.onReturnToCopilot}
                    fallback={
                      <>
                        <Show when={isConnectionTestable(resource().type)}>
                          <Button
                            variant="outline"
                            size="sm"
                            class="h-6 px-2 text-2xs"
                            onClick={handleTestConnection}
                            disabled={testing() || !selection()}
                          >
                            <Show when={testing()} fallback={<Plugs class="h-3 w-3" />}>
                              <Spinner size="xs" />
                            </Show>
                            {testing() ? "Testing..." : "Test connection"}
                          </Button>
                        </Show>
                        <Button
                          variant="default"
                          size="sm"
                          class="h-6 px-2 text-2xs"
                          onClick={handleSave}
                          disabled={!hasChanges() || saveStatus() === "saving"}
                        >
                          <Show when={saveStatus() === "saving"}>
                            <Spinner size="xs" class="border-white border-t-transparent" />
                          </Show>
                          {saveStatus() === "saving" ? "Saving..." : "Save changes"}
                        </Button>
                      </>
                    }
                  >
                    <Button
                      variant="default"
                      size="sm"
                      class="h-6 px-2 text-2xs"
                      onClick={handleSaveAndReturn}
                      disabled={savingAndReturning()}
                    >
                      <Show when={savingAndReturning()}>
                        <Spinner size="xs" class="border-white border-t-transparent" />
                      </Show>
                      {savingAndReturning() ? "Testing..." : "Save & Return to Copilot"}
                    </Button>
                  </Show>
                </div>
              </div>

              {/* Tabs */}
              <div class="flex items-center border-b border-border px-3">
                <button
                  type="button"
                  class="-mb-px border-b px-0.5 py-2 text-xs font-medium transition-colors"
                  classList={{
                    "border-accent text-text": activeTab() === "configuration",
                    "border-transparent text-text-muted hover:text-text": activeTab() !== "configuration",
                  }}
                  onClick={() => setActiveTab("configuration")}
                >
                  Configuration
                </button>
                <button
                  type="button"
                  class="-mb-px ml-4 border-b px-0.5 py-2 text-xs font-medium transition-colors"
                  classList={{
                    "border-accent text-text": activeTab() === "logs",
                    "border-transparent text-text-muted hover:text-text": activeTab() !== "logs",
                  }}
                  onClick={() => setActiveTab("logs")}
                >
                  Logs
                </button>
              </div>

              {/* Content */}
              <div class="flex-1 overflow-hidden">
                <Show when={activeTab() === "configuration"}>
                  <div class="flex h-full">
                    {/* Left Pane - Outline */}
                    <div class="w-48 shrink-0">
                      <OutlinePanel
                        configs={getEffectiveConfigs()}
                        environments={props.environments}
                        selection={selection()}
                        unsavedEnvIds={unsavedEnvIds()}
                        onSelect={setSelection}
                        onAddEnvironment={handleAddEnvironment}
                        onRemoveEnvironment={handleRemoveEnvironment}
                      />
                    </div>
                    {/* Right Pane - Inspector */}
                    <div class="flex-1 border-l border-border">
                      <InspectorPanel
                        resource={{ ...resource(), configs: getEffectiveConfigs() }}
                        selection={selection()}
                        connectors={props.connectors}
                        appAccounts={props.appAccounts}
                        pendingConnectorId={props.pendingConnectorId}
                        newConnectorToken={props.newConnectorToken}
                        testResult={testResult()}
                        llmValidationErrors={llmValidationErrors()}
                        getEditState={getEditState}
                        onEditStateChange={handleEditStateChange}
                        onToggleLlmEnabled={handleToggleLlmEnabled}
                        onAppConnect={props.onAppConnect}
                        onConnectorCreate={props.onConnectorCreate}
                        onConnectorTokenDismiss={props.onConnectorTokenDismiss}
                      />
                    </div>
                  </div>
                </Show>

                <Show when={activeTab() === "logs"}>
                  <div class="flex h-64 items-center justify-center text-sm text-text-muted">Logs coming soon</div>
                </Show>
              </div>

              <Modal
                open={editModalOpen()}
                onBackdropClick={() => setEditModalOpen(false)}
                onEscape={() => setEditModalOpen(false)}
              >
                <ModalContainer size="sm">
                  <div class="border-b border-border px-4 py-3">
                    <h3 class="text-xs font-medium text-text">Edit resource</h3>
                  </div>
                  <ModalBody>
                    <div class="flex flex-col gap-3">
                      <div class="flex items-center gap-2">
                        <label class="w-20 shrink-0 text-xs text-text-muted">Name</label>
                        <Input
                          type="text"
                          value={editedName()}
                          onInput={(e) => setEditedName(e.currentTarget.value)}
                          class="h-7 flex-1 text-xs"
                        />
                      </div>
                      <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-2">
                          <label class="w-20 shrink-0 text-xs text-text-muted">Slug</label>
                          <Input
                            type="text"
                            value={editedSlug()}
                            onInput={(e) => setEditedSlug(e.currentTarget.value)}
                            class="h-7 flex-1 font-mono text-xs"
                          />
                        </div>
                        <Show when={slugChanged()}>
                          <div class="ml-[88px] rounded bg-warning-soft px-2 py-1.5 text-2xs text-warning">
                            This slug is referenced by Agent tools. Changing it may break existing references.
                          </div>
                        </Show>
                      </div>
                      <div class="flex items-start gap-2">
                        <label class="w-20 shrink-0 pt-1.5 text-xs text-text-muted">Description</label>
                        <Textarea
                          value={editedDescription()}
                          onInput={(e) => setEditedDescription(e.currentTarget.value)}
                          rows={3}
                          placeholder="Optional description"
                          class="flex-1"
                        />
                      </div>
                    </div>
                  </ModalBody>
                  <ModalFooter>
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={props.saving || !editedName().trim() || !editedSlug().trim()}
                      >
                        {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
                        {props.saving ? "Saving..." : "Save"}
                      </Button>
                    </>
                  </ModalFooter>
                </ModalContainer>
              </Modal>
            </>
          )
        }}
      </Show>
    </div>
  )
}
