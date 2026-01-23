import { Show, createSignal, createEffect, createMemo, onCleanup, on } from "solid-js"
import { useBeforeLeave } from "@solidjs/router"
import {
  Skeleton,
  SkeletonText,
  Input,
  Button,
  Spinner,
  Modal,
  ModalContainer,
  ModalBody,
  ModalFooter,
} from "../../../ui"
import { AppIcon } from "../../../components"
import { Broadcast, Timer, PencilSimple, Lightning, Cube, Check, WarningCircle } from "phosphor-solid-js"
import { activeOrg, api, apiBaseURL } from "../../../app"
import { ScheduleMode } from "@synatra/core/types"
import { AddEnvironmentModal } from "./add-environment-modal"
import { generateSampleFromSchema, ensureObjectSchema, getAppPayloadSchema } from "./utils"
import { VersionControl, type TriggerRelease } from "./version-control"
import { DeployDropdown } from "./deploy-dropdown"
import { OutlinePanel } from "./outline-panel"
import { InspectorPanel } from "./inspector-panel"
import type { Selection } from "./constants"
import type { PromptMode } from "./inspector/prompt-inspector"
import type { AppAccountInfo } from "./inspector/settings-inspector"
export type { AppAccountInfo }
import type { Environments, Prompts, Channels } from "../../../app/api"

type AgentInfo = {
  id: string
  name: string
  slug: string
  icon: string
  iconColor: string
}

type PromptInfo = {
  id: string
  name: string
  slug: string
  inputSchema: unknown
}

type AgentRelease = {
  id: string
  version: string
  createdAt: string
}

type TriggerEnvironmentInfo = {
  id: string
  triggerId: string
  environmentId: string
  channelId: string
  webhookSecret: string | null
  debugSecret: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  environment: { id: string; name: string; slug: string; color: string }
  channel: { id: string; name: string; slug: string }
}

export type TriggerDetailData = {
  id: string
  organizationId: string
  agentId: string
  agentReleaseId: string | null
  agentVersionMode: "current" | "fixed"
  promptId: string | null
  promptReleaseId: string | null
  promptVersionMode: "current" | "fixed"
  mode: "prompt" | "template" | "script"
  template: string
  script: string
  payloadSchema: unknown
  name: string
  slug: string
  type: "webhook" | "schedule" | "app"
  cron: string | null
  scheduleMode: ScheduleMode
  timezone: string
  input: Record<string, unknown> | null
  appAccountId: string | null
  appEvents: string[] | null
  currentReleaseId: string | null
  version: string | null
  configHash: string | null
  createdAt: string
  updatedAt: string
  agent: AgentInfo | null
  prompt: PromptInfo | null
  environments: TriggerEnvironmentInfo[]
}

export type TriggerWorkingCopy = {
  triggerId: string
  agentReleaseId: string | null
  agentVersionMode: "current" | "fixed"
  promptId: string | null
  promptReleaseId: string | null
  promptVersionMode: "current" | "fixed"
  mode: "prompt" | "template" | "script"
  template: string
  script: string
  payloadSchema: unknown
  type: "webhook" | "schedule" | "app"
  cron: string | null
  scheduleMode: ScheduleMode
  timezone: string
  input: Record<string, unknown> | null
  appAccountId: string | null
  appEvents: string[] | null
  configHash: string
  updatedAt: string
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

type PromptReleaseItem = {
  id: string
  version: string
  createdAt: string
}

type TriggerDetailProps = {
  trigger: TriggerDetailData | null
  workingCopy?: TriggerWorkingCopy | null
  releases?: TriggerRelease[]
  prompts: Prompts
  environments: Environments
  channels: Channels
  appAccounts?: AppAccountInfo[]
  agentChannelIds?: string[]
  promptReleases?: PromptReleaseItem[]
  pendingAppAccountId?: string | null
  loading?: boolean
  onPromptChange?: (promptId: string) => void
  onAppConnect?: (appId: string | null) => void
  onUpdateName?: (id: string, name: string) => Promise<void>
  onSaveWorkingCopy?: (
    id: string,
    config: Record<string, unknown>,
    options?: { addAgentToChannel?: boolean; agentId?: string; channelId?: string },
  ) => Promise<void>
  onDeploy?: (id: string, bump: "major" | "minor" | "patch", description: string) => Promise<void>
  onAdopt?: (triggerId: string, releaseId: string) => Promise<void>
  onCheckout?: (triggerId: string, releaseId: string) => Promise<void>
  onAddEnvironment?: (
    triggerId: string,
    environmentId: string,
    channelId: string,
    addAgentToChannel: boolean,
  ) => Promise<void>
  onRemoveEnvironment?: (triggerId: string, environmentId: string) => Promise<void>
  onUpdateEnvironmentChannel?: (triggerId: string, environmentId: string, channelId: string) => Promise<void>
  onToggleEnvironment?: (triggerId: string, environmentId: string) => Promise<void>
  onRegenerateWebhookSecret?: (triggerId: string, environmentId: string) => Promise<void>
  onRegenerateDebugSecret?: (triggerId: string, environmentId: string) => Promise<void>
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
    <div class="flex h-full flex-col items-center justify-center gap-3 p-8">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <Lightning class="h-6 w-6 text-text-muted/50" />
      </div>
      <div class="text-center">
        <p class="text-[13px] font-medium text-text">Select a trigger</p>
        <p class="mt-0.5 text-xs text-text-muted">Choose a trigger from the list to view details</p>
      </div>
    </div>
  )
}

type TriggerConfig = {
  agentId: string | null
  agentReleaseId: string | null
  agentVersionMode: "current" | "fixed"
  promptId: string | null
  promptReleaseId: string | null
  promptVersionMode: "current" | "fixed"
  mode: "prompt" | "template" | "script"
  template: string
  script: string
  payloadSchema: unknown
  type: "webhook" | "schedule" | "app"
  cron: string | null
  scheduleMode: ScheduleMode
  timezone: string
  input: Record<string, unknown> | null
  appAccountId: string | null
  appEvents: string[] | null
}

function serializeConfig(config: TriggerConfig): string {
  const sortValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortValue)
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>
      const keys = Object.keys(record).sort()
      const sorted: Record<string, unknown> = {}
      for (const key of keys) {
        sorted[key] = sortValue(record[key])
      }
      return sorted
    }
    return value
  }
  return JSON.stringify(sortValue(config))
}

export function TriggerDetail(props: TriggerDetailProps) {
  const [editNameModalOpen, setEditNameModalOpen] = createSignal(false)
  const [editedName, setEditedName] = createSignal("")
  const [editedType, setEditedType] = createSignal<"webhook" | "schedule" | "app">("webhook")
  const [editedAgentVersionMode, setEditedAgentVersionMode] = createSignal<"current" | "fixed">("current")
  const [agentReleases, setAgentReleases] = createSignal<AgentRelease[]>([])
  const [editedAgentReleaseId, setEditedAgentReleaseId] = createSignal<string | null>(null)
  const [editedPromptId, setEditedPromptId] = createSignal("")
  const [editedPromptVersionMode, setEditedPromptVersionMode] = createSignal<"current" | "fixed">("current")
  const [editedPromptReleaseId, setEditedPromptReleaseId] = createSignal<string | null>(null)
  const [editedPromptContent, setEditedPromptContent] = createSignal("")
  const [editedPayloadSchema, setEditedPayloadSchema] = createSignal<Record<string, unknown>>({
    type: "object",
    properties: {},
  })
  const [promptMode, setPromptMode] = createSignal<PromptMode>("template")
  const [editedScript, setEditedScript] = createSignal("")
  const [editedCron, setEditedCron] = createSignal("")
  const [editedScheduleMode, setEditedScheduleMode] = createSignal<ScheduleMode>("interval")
  const [editedTimezone, setEditedTimezone] = createSignal("UTC")
  const [editedInput, setEditedInput] = createSignal("")
  const [editedAppAccountId, setEditedAppAccountId] = createSignal<string | null>(null)
  const [editedAppEvents, setEditedAppEvents] = createSignal<string[]>([])
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("idle")
  const [isDirty, setIsDirty] = createSignal(false)
  const [lastSavedHash, setLastSavedHash] = createSignal("")
  const [savingName, setSavingName] = createSignal(false)
  const [deployError, setDeployError] = createSignal<string | null>(null)
  const [selection, setSelection] = createSignal<Selection | null>({ type: "settings" })

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const AUTO_SAVE_DELAY = 1000

  const currentRelease = () => props.releases?.find((r) => r.id === props.trigger?.currentReleaseId)

  const getCurrentConfig = (): TriggerConfig => ({
    agentId: props.trigger?.agentId ?? null,
    agentReleaseId: editedAgentReleaseId(),
    agentVersionMode: editedAgentVersionMode(),
    promptId: editedPromptId() || null,
    promptReleaseId: editedPromptReleaseId(),
    promptVersionMode: editedPromptVersionMode(),
    mode: promptMode(),
    template: editedPromptContent(),
    script: editedScript(),
    payloadSchema: editedPayloadSchema(),
    type: editedType(),
    cron: editedCron() || null,
    scheduleMode: editedScheduleMode(),
    timezone: editedTimezone(),
    input: editedInput().trim() ? JSON.parse(editedInput()) : null,
    appAccountId: editedAppAccountId(),
    appEvents: editedAppEvents().length > 0 ? editedAppEvents() : null,
  })

  const scheduleAutoSave = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      if (isDirty()) handleSave()
    }, AUTO_SAVE_DELAY)
  }

  const saveImmediately = async () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    if (isDirty()) {
      await handleSave()
    }
  }

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty()) {
      e.preventDefault()
      return ""
    }
  }

  useBeforeLeave((e) => {
    if (isDirty()) {
      e.preventDefault()
      saveImmediately().then(() => {
        if (saveStatus() !== "error") e.retry(true)
      })
    }
  })

  onCleanup(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    window.removeEventListener("beforeunload", handleBeforeUnload)
  })

  createEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload)
  })

  const markDirty = () => {
    const config = getCurrentConfig()
    const dirty = serializeConfig(config) !== lastSavedHash()
    setIsDirty(dirty)
    setSaveStatus("idle")
    if (dirty) scheduleAutoSave()
  }

  const handleSave = async () => {
    const trigger = props.trigger
    if (!trigger || !props.onSaveWorkingCopy) return
    const config = getCurrentConfig()
    const configHash = serializeConfig(config)
    if (configHash === lastSavedHash()) {
      setIsDirty(false)
      return
    }
    setSaveStatus("saving")
    try {
      await props.onSaveWorkingCopy(trigger.id, config as unknown as Record<string, unknown>)
      setLastSavedHash(configHash)
      setSaveStatus("saved")
      setIsDirty(false)
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch {
      setSaveStatus("error")
    }
  }

  const getReleaseConfig = (): TriggerConfig | null => {
    const trigger = props.trigger
    if (!trigger) return null
    return {
      agentId: trigger.agentId,
      agentReleaseId: trigger.agentReleaseId,
      agentVersionMode: trigger.agentVersionMode,
      promptId: trigger.promptId,
      promptReleaseId: trigger.promptReleaseId,
      promptVersionMode: trigger.promptVersionMode,
      mode: trigger.mode,
      template: trigger.template,
      script: trigger.script,
      payloadSchema: ensureObjectSchema(trigger.payloadSchema),
      type: trigger.type,
      cron: trigger.cron,
      scheduleMode: trigger.scheduleMode,
      timezone: trigger.timezone,
      input: trigger.input,
      appAccountId: trigger.appAccountId,
      appEvents: trigger.appEvents,
    }
  }

  const hasUndeployedChanges = () => {
    const releaseConfig = getReleaseConfig()
    if (!releaseConfig) return false
    return serializeConfig(getCurrentConfig()) !== serializeConfig(releaseConfig)
  }

  const canDeploy = () => {
    if (isDirty()) return false
    const trigger = props.trigger
    const wc = props.workingCopy
    if (!trigger || !wc) return false
    if (!trigger.configHash) return true
    return wc.configHash !== trigger.configHash
  }

  const handleDeploy = async (data: { bump: "major" | "minor" | "patch"; description: string }) => {
    const trigger = props.trigger
    if (!trigger || !props.onDeploy) return
    setDeployError(null)
    await saveImmediately()
    if (isDirty() || saveStatus() === "error") return
    try {
      await props.onDeploy(trigger.id, data.bump, data.description)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Deploy failed"
      setDeployError(message)
    }
  }

  const fetchAgentReleases = async (agentId: string) => {
    try {
      const res = await api.api.agents[":id"].releases.$get({ param: { id: agentId } })
      if (res.ok) {
        const data = (await res.json()) as AgentRelease[]
        setAgentReleases(data)
      }
    } catch (e) {
      console.error("Failed to fetch agent releases", e)
    }
  }

  const initializeFromSource = (source: TriggerWorkingCopy | TriggerDetailData) => {
    setEditedType(source.type)
    setEditedAgentVersionMode(source.agentVersionMode)
    setEditedAgentReleaseId(source.agentReleaseId)
    setEditedPromptId(source.promptId ?? "")
    setEditedPromptVersionMode(source.promptVersionMode)
    setEditedPromptReleaseId(source.promptReleaseId)
    setEditedPromptContent(source.template ?? "")
    setEditedScript(source.script ?? "")
    setEditedPayloadSchema(ensureObjectSchema(source.payloadSchema))
    setPromptMode(source.mode)
    setEditedCron(source.cron || (source.type === "schedule" ? "0 9 * * *" : ""))
    setEditedScheduleMode(source.scheduleMode || "interval")
    setEditedTimezone(source.timezone || "UTC")
    setEditedInput(source.input ? JSON.stringify(source.input, null, 2) : "")
    setEditedAppAccountId(source.appAccountId)
    setEditedAppEvents(source.appEvents ?? [])
  }

  createEffect(
    on(
      () => [props.trigger?.id, props.workingCopy?.triggerId] as const,
      ([triggerId, wcTriggerId], prev) => {
        const trigger = props.trigger
        const wc = props.workingCopy
        const prevTriggerId = prev?.[0]
        if (trigger && triggerId !== prevTriggerId) {
          const source = wc ?? trigger
          initializeFromSource(source)
          const config = getCurrentConfig()
          setLastSavedHash(serializeConfig(config))
          setIsDirty(false)
          setSaveStatus("idle")
          fetchAgentReleases(trigger.agentId)
          return
        }
        if (trigger && wc && triggerId === wcTriggerId && !isDirty()) {
          initializeFromSource(wc)
          const config = getCurrentConfig()
          setLastSavedHash(serializeConfig(config))
        }
      },
    ),
  )

  createEffect(() => {
    const promptId = editedPromptId()
    if (promptId && props.onPromptChange) {
      props.onPromptChange(promptId)
    }
  })

  createEffect(() => {
    const pending = props.pendingAppAccountId
    if (pending && props.appAccounts?.some((a) => a.id === pending)) {
      setEditedAppAccountId(pending)
      setEditedAppEvents([])
      setEditedType("app")
    }
  })

  const inputPlaceholder = () => {
    const trigger = props.trigger
    if (trigger?.prompt?.inputSchema) {
      return JSON.stringify(generateSampleFromSchema(trigger.prompt.inputSchema as Record<string, unknown>), null, 2)
    }
    return "{}"
  }

  const openEditNameModal = () => {
    if (!props.trigger) return
    setEditedName(props.trigger.name)
    setEditNameModalOpen(true)
  }

  const handleSaveName = async () => {
    if (!props.trigger || !props.onUpdateName) return
    const name = editedName().trim()
    if (!name || name === props.trigger.name) {
      setEditNameModalOpen(false)
      return
    }
    setSavingName(true)
    try {
      await props.onUpdateName(props.trigger.id, name)
      setEditNameModalOpen(false)
    } finally {
      setSavingName(false)
    }
  }

  const selectedPrompt = () => props.prompts.find((p) => p.id === editedPromptId())
  const selectedAppAccount = () => props.appAccounts?.find((a) => a.id === editedAppAccountId())

  const effectivePayloadSchema = createMemo(() => {
    if (editedType() === "app") {
      const appId = selectedAppAccount()?.appId
      return getAppPayloadSchema(appId, editedAppEvents()) ?? editedPayloadSchema()
    }
    return editedPayloadSchema()
  })

  let lastValidTriggerId: string | undefined = undefined
  createEffect(
    on(
      () => props.trigger?.id,
      (id) => {
        if (id && lastValidTriggerId !== undefined && id !== lastValidTriggerId) {
          setSelection({ type: "settings" })
        }
        if (id) {
          lastValidTriggerId = id
        }
      },
      { defer: true },
    ),
  )

  const [addEnvModalOpen, setAddEnvModalOpen] = createSignal(false)
  const [removeEnvModalOpen, setRemoveEnvModalOpen] = createSignal(false)
  const [envToRemove, setEnvToRemove] = createSignal<string | null>(null)
  const [removingEnv, setRemovingEnv] = createSignal(false)

  const envToRemoveInfo = () => {
    const envId = envToRemove()
    if (!envId) return null
    return props.trigger?.environments.find((e) => e.environmentId === envId)
  }

  const handleRemoveEnvironment = async () => {
    const envId = envToRemove()
    if (!envId || !props.trigger) return
    setRemovingEnv(true)
    try {
      await props.onRemoveEnvironment?.(props.trigger.id, envId)
      if (selection()?.type === "environment" && (selection() as { environmentId: string }).environmentId === envId) {
        setSelection({ type: "settings" })
      }
      setRemoveEnvModalOpen(false)
      setEnvToRemove(null)
    } finally {
      setRemovingEnv(false)
    }
  }

  return (
    <div class="flex flex-1 flex-col overflow-hidden bg-surface-elevated">
      <Show when={props.loading}>
        <LoadingState />
      </Show>
      <Show when={!props.loading && !props.trigger}>
        <EmptyState />
      </Show>
      <Show when={!props.loading && props.trigger}>
        {(trigger) => (
          <div class="flex h-full flex-col">
            <div class="flex items-center justify-between border-b border-border px-3 py-2">
              <div class="flex items-center gap-2">
                <div class="flex h-6 w-6 items-center justify-center rounded bg-surface-muted">
                  <Show when={editedType() === "webhook"}>
                    <Broadcast class="h-3.5 w-3.5 text-text-muted" />
                  </Show>
                  <Show when={editedType() === "schedule"}>
                    <Timer class="h-3.5 w-3.5 text-text-muted" />
                  </Show>
                  <Show when={editedType() === "app"}>
                    <Show when={selectedAppAccount()?.appId} fallback={<Cube class="h-3.5 w-3.5 text-text-muted" />}>
                      {(appId) => <AppIcon appId={appId()} class="h-3.5 w-3.5" />}
                    </Show>
                  </Show>
                </div>
                <button
                  type="button"
                  class="group -mx-1.5 flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-muted"
                  onClick={openEditNameModal}
                >
                  {trigger().name}
                  <PencilSimple class="h-3 w-3 text-text-muted opacity-0 group-hover:opacity-100" />
                </button>
                <VersionControl
                  currentVersion={trigger().version}
                  currentReleaseId={trigger().currentReleaseId}
                  releases={props.releases ?? []}
                  hasUndeployedChanges={hasUndeployedChanges()}
                  workingCopyUpdatedAt={props.workingCopy?.updatedAt}
                  onAdopt={(releaseId) => props.onAdopt?.(trigger().id, releaseId)}
                  onCheckout={(releaseId) => props.onCheckout?.(trigger().id, releaseId)}
                />
              </div>
              <div class="flex items-center gap-3">
                <Show when={saveStatus() === "saving"}>
                  <span class="text-xs text-text-muted">Saving...</span>
                </Show>
                <Show when={saveStatus() === "saved"}>
                  <span class="flex items-center gap-1 text-xs text-success">
                    <Check class="h-3 w-3" weight="bold" /> Saved
                  </span>
                </Show>
                <Show when={saveStatus() === "error"}>
                  <span class="text-xs text-danger">Save failed</span>
                </Show>
                <Show when={deployError()}>
                  <div class="flex items-center gap-1.5 rounded bg-danger-soft px-2 py-1">
                    <WarningCircle size={12} weight="fill" class="shrink-0 text-danger" />
                    <span class="text-xs text-danger">{deployError()}</span>
                  </div>
                </Show>
                <Show when={hasUndeployedChanges()}>
                  <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    Undeployed changes
                  </span>
                </Show>
                <DeployDropdown currentVersion={trigger().version} disabled={!canDeploy()} onDeploy={handleDeploy} />
              </div>
            </div>

            <div class="flex flex-1 overflow-hidden">
              <div class="w-48 shrink-0 border-r border-border">
                <OutlinePanel
                  environments={trigger().environments}
                  availableEnvironments={props.environments
                    .filter((e) => !trigger().environments.some((te) => te.environmentId === e.id))
                    .map((e) => ({ id: e.id, name: e.name, color: e.color ?? "#3B82F6" }))}
                  selection={selection()}
                  onSelect={setSelection}
                  onAddEnvironment={() => setAddEnvModalOpen(true)}
                  onRemoveEnvironment={(envId) => {
                    setEnvToRemove(envId)
                    setRemoveEnvModalOpen(true)
                  }}
                  onToggleEnvironment={(envId) => props.onToggleEnvironment?.(trigger().id, envId)}
                />
              </div>
              <div class="flex-1 overflow-hidden">
                <InspectorPanel
                  selection={selection()}
                  triggerSlug={trigger().slug}
                  triggerType={editedType()}
                  orgSlug={activeOrg()?.slug ?? ""}
                  apiBaseUrl={apiBaseURL}
                  agentVersionMode={editedAgentVersionMode()}
                  agentReleaseId={editedAgentReleaseId()}
                  agentReleases={agentReleases()}
                  environments={trigger().environments}
                  availableChannels={props.channels}
                  releases={props.releases}
                  currentReleaseId={trigger().currentReleaseId}
                  payloadSchema={effectivePayloadSchema()}
                  prompts={props.prompts.filter((p) => p.agentId === props.trigger?.agentId)}
                  promptMode={promptMode()}
                  selectedPromptId={editedPromptId()}
                  promptVersionMode={editedPromptVersionMode()}
                  promptReleases={props.promptReleases ?? []}
                  selectedPromptReleaseId={editedPromptReleaseId()}
                  promptContent={editedPromptContent()}
                  script={editedScript()}
                  currentPromptInputSchema={
                    selectedPrompt()?.id === props.trigger?.prompt?.id ? props.trigger?.prompt?.inputSchema : undefined
                  }
                  input={editedInput()}
                  inputPlaceholder={inputPlaceholder()}
                  appAccounts={props.appAccounts ?? []}
                  selectedAppAccountId={editedAppAccountId()}
                  appEvents={editedAppEvents()}
                  onTypeChange={(v) => {
                    setEditedType(v)
                    if (v === "schedule" && !editedCron()) {
                      setEditedCron("0 9 * * *")
                    }
                    markDirty()
                  }}
                  onAgentVersionModeChange={(v) => {
                    setEditedAgentVersionMode(v)
                    markDirty()
                  }}
                  onAgentReleaseIdChange={(v) => {
                    setEditedAgentReleaseId(v)
                    markDirty()
                  }}
                  cron={editedCron()}
                  scheduleMode={editedScheduleMode()}
                  timezone={editedTimezone()}
                  onCronChange={(v) => {
                    setEditedCron(v)
                    markDirty()
                  }}
                  onScheduleModeChange={(v) => {
                    setEditedScheduleMode(v)
                    markDirty()
                  }}
                  onTimezoneChange={(v) => {
                    setEditedTimezone(v)
                    markDirty()
                  }}
                  onAppAccountChange={(v) => {
                    setEditedAppAccountId(v)
                    setEditedAppEvents([])
                    markDirty()
                  }}
                  onAppEventsChange={(v) => {
                    setEditedAppEvents(v)
                    markDirty()
                  }}
                  onAppConnect={props.onAppConnect}
                  onRegenerateWebhookSecret={(envId) =>
                    props.onRegenerateWebhookSecret?.(trigger().id, envId) ?? Promise.resolve()
                  }
                  onRegenerateDebugSecret={(envId) =>
                    props.onRegenerateDebugSecret?.(trigger().id, envId) ?? Promise.resolve()
                  }
                  onUpdateEnvironmentChannel={(envId, channelId) =>
                    props.onUpdateEnvironmentChannel?.(trigger().id, envId, channelId) ?? Promise.resolve()
                  }
                  onPromptModeChange={(v) => {
                    setPromptMode(v)
                    markDirty()
                  }}
                  onPromptIdChange={(v) => {
                    setEditedPromptId(v)
                    markDirty()
                  }}
                  onPromptVersionModeChange={(v) => {
                    setEditedPromptVersionMode(v)
                    markDirty()
                  }}
                  onPromptReleaseIdChange={(v) => {
                    setEditedPromptReleaseId(v)
                    markDirty()
                  }}
                  onPromptContentChange={(v) => {
                    setEditedPromptContent(v)
                    markDirty()
                  }}
                  onScriptChange={(v) => {
                    setEditedScript(v)
                    markDirty()
                  }}
                  onPayloadSchemaChange={(v) => {
                    setEditedPayloadSchema(v)
                    markDirty()
                  }}
                  onInputChange={(v) => {
                    setEditedInput(v)
                    markDirty()
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </Show>

      <AddEnvironmentModal
        open={addEnvModalOpen()}
        environments={props.environments}
        channels={props.channels}
        existingEnvironmentIds={props.trigger?.environments.map((e) => e.environmentId) ?? []}
        agentName={props.trigger?.agent?.name ?? ""}
        agentChannelIds={props.agentChannelIds ?? []}
        onClose={() => setAddEnvModalOpen(false)}
        onAdd={async (environmentId, channelId, addAgentToChannel) => {
          if (props.trigger && props.onAddEnvironment) {
            await props.onAddEnvironment(props.trigger.id, environmentId, channelId, addAgentToChannel)
            setSelection({ type: "environment", environmentId })
          }
        }}
      />

      <Modal
        open={removeEnvModalOpen()}
        onBackdropClick={() => setRemoveEnvModalOpen(false)}
        onEscape={() => setRemoveEnvModalOpen(false)}
      >
        <ModalContainer size="sm">
          <div class="border-b border-border px-4 py-3">
            <h3 class="text-xs font-medium text-text">Remove environment</h3>
          </div>
          <ModalBody>
            <p class="text-xs text-text-muted">
              Are you sure you want to remove{" "}
              <span class="font-medium text-text">{envToRemoveInfo()?.environment.name}</span> from this trigger?
            </p>
            <p class="mt-2 text-xs text-text-muted">
              This will disable the trigger for this environment. Webhook URLs and secrets will be invalidated.
            </p>
          </ModalBody>
          <ModalFooter>
            <>
              <Button variant="ghost" size="sm" onClick={() => setRemoveEnvModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleRemoveEnvironment} disabled={removingEnv()}>
                {removingEnv() && <Spinner size="xs" class="border-white border-t-transparent" />}
                {removingEnv() ? "Removing..." : "Remove"}
              </Button>
            </>
          </ModalFooter>
        </ModalContainer>
      </Modal>

      <Modal
        open={editNameModalOpen()}
        onBackdropClick={() => setEditNameModalOpen(false)}
        onEscape={() => setEditNameModalOpen(false)}
      >
        <ModalContainer size="sm">
          <div class="border-b border-border px-4 py-3">
            <h3 class="text-xs font-medium text-text">Edit trigger</h3>
          </div>
          <ModalBody>
            <div class="flex items-center gap-2">
              <label class="w-16 shrink-0 text-xs text-text-muted">Name</label>
              <Input
                type="text"
                value={editedName()}
                onInput={(e) => setEditedName(e.currentTarget.value)}
                class="h-7 flex-1 text-xs"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditNameModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveName}
                disabled={savingName() || !editedName().trim()}
              >
                {savingName() && <Spinner size="xs" class="border-white border-t-transparent" />}
                {savingName() ? "Saving..." : "Save"}
              </Button>
            </>
          </ModalFooter>
        </ModalContainer>
      </Modal>
    </div>
  )
}
