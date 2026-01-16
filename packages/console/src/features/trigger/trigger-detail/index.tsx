import { Show, createSignal, createEffect, createMemo, onCleanup, on } from "solid-js"
import { useBeforeLeave } from "@solidjs/router"
import {
  Skeleton,
  SkeletonText,
  Input,
  FormField,
  Select,
  MultiSelect,
  Button,
  Spinner,
  Modal,
  ModalContainer,
  ModalBody,
  ModalFooter,
  CollapsibleSection,
} from "../../../ui"
import { getIconComponent, ICON_COLORS, AppIcon } from "../../../components"
import { Broadcast, Timer, PencilSimple, Lightning, Cube, Plus, Check } from "phosphor-solid-js"
import { activeOrg, api, apiBaseURL } from "../../../app"
import { EnvironmentSection } from "./environment-section"
import { AddEnvironmentModal } from "./add-environment-modal"
import { PromptSection, type PromptMode } from "./prompt-section"
import { generateSampleFromSchema, generateSamplePayload, ensureObjectSchema, getAppPayloadSchema } from "./utils"
import { ScheduleEditor } from "./schedule-editor"
import { VersionControl, type TriggerRelease } from "./version-control"
import { DeployDropdown } from "./deploy-dropdown"
import type { Environments, Prompts, Channels } from "../../../app/api"

const APP_EVENTS: Record<string, { value: string; label: string }[]> = {
  intercom: [
    { value: "conversation.user.created", label: "New conversation" },
    { value: "conversation.user.replied", label: "Customer replied" },
    { value: "conversation.admin.replied", label: "Admin replied" },
    { value: "conversation.admin.closed", label: "Conversation closed" },
  ],
  github: [
    { value: "push", label: "Push" },
    { value: "create.branch", label: "Branch created" },
    { value: "create.tag", label: "Tag created" },
    { value: "delete.branch", label: "Branch deleted" },
    { value: "delete.tag", label: "Tag deleted" },
    { value: "pull_request.opened", label: "PR opened" },
    { value: "pull_request.merged", label: "PR merged" },
    { value: "pull_request.closed", label: "PR closed" },
    { value: "pull_request.reopened", label: "PR reopened" },
    { value: "pull_request.synchronize", label: "PR updated" },
    { value: "pull_request.ready_for_review", label: "PR ready for review" },
    { value: "issues.opened", label: "Issue opened" },
    { value: "issues.closed", label: "Issue closed" },
    { value: "issues.reopened", label: "Issue reopened" },
    { value: "issue_comment.created", label: "Issue comment" },
    { value: "pull_request_comment.created", label: "PR comment" },
    { value: "pull_request_review.approved", label: "Review approved" },
    { value: "pull_request_review.changes_requested", label: "Changes requested" },
    { value: "pull_request_review.commented", label: "Review commented" },
    { value: "release.published", label: "Release published" },
  ],
}

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

type IntercomMetadata = { workspaceName?: string; workspaceId?: string }
type GitHubMetadata = { accountLogin: string; accountType: "User" | "Organization" }

export type AppAccountInfo = {
  id: string
  appId: string
  name: string
  metadata: IntercomMetadata | GitHubMetadata | null
}

function getAppAccountDetail(account: AppAccountInfo | null | undefined): string | null {
  if (!account?.metadata) return null
  if ("workspaceName" in account.metadata) {
    return account.metadata.workspaceName ?? null
  }
  if ("accountLogin" in account.metadata) {
    return `${account.metadata.accountLogin} (${account.metadata.accountType})`
  }
  return null
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
  const [editedTimezone, setEditedTimezone] = createSignal("UTC")
  const [editedInput, setEditedInput] = createSignal("")
  const [editedAppAccountId, setEditedAppAccountId] = createSignal<string | null>(null)
  const [editedAppEvents, setEditedAppEvents] = createSignal<string[]>([])
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("idle")
  const [isDirty, setIsDirty] = createSignal(false)
  const [lastSavedHash, setLastSavedHash] = createSignal("")
  const [savingName, setSavingName] = createSignal(false)

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
    await saveImmediately()
    if (isDirty() || saveStatus() === "error") return
    await props.onDeploy(trigger.id, data.bump, data.description)
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
    setEditedCron(source.cron ?? "")
    setEditedTimezone(source.timezone)
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

  const [addEnvModalOpen, setAddEnvModalOpen] = createSignal(false)

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
                <Show when={hasUndeployedChanges()}>
                  <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    Undeployed changes
                  </span>
                </Show>
                <DeployDropdown currentVersion={trigger().version} disabled={!canDeploy()} onDeploy={handleDeploy} />
              </div>
            </div>

            <div class="flex-1 overflow-y-auto scrollbar-thin">
              <CollapsibleSection title="General">
                <div class="space-y-3">
                  <FormField horizontal labelWidth="5rem" label="Slug">
                    <span class="py-1 font-code text-xs text-text">{trigger().slug}</span>
                  </FormField>
                  <FormField horizontal labelWidth="5rem" label="Type">
                    <div class="flex gap-1.5">
                      <button
                        type="button"
                        class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                        classList={{
                          "border-accent bg-accent/5 text-text": editedType() === "webhook",
                          "border-border text-text-muted hover:border-border-strong": editedType() !== "webhook",
                        }}
                        onClick={() => {
                          setEditedType("webhook")
                          markDirty()
                        }}
                      >
                        <Broadcast class="h-3 w-3" />
                        Webhook
                      </button>
                      <button
                        type="button"
                        class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                        classList={{
                          "border-accent bg-accent/5 text-text": editedType() === "schedule",
                          "border-border text-text-muted hover:border-border-strong": editedType() !== "schedule",
                        }}
                        onClick={() => {
                          setEditedType("schedule")
                          markDirty()
                        }}
                      >
                        <Timer class="h-3 w-3" />
                        Schedule
                      </button>
                      <button
                        type="button"
                        class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                        classList={{
                          "border-accent bg-accent/5 text-text": editedType() === "app",
                          "border-border text-text-muted hover:border-border-strong": editedType() !== "app",
                        }}
                        onClick={() => {
                          setEditedType("app")
                          markDirty()
                        }}
                      >
                        <Cube class="h-3 w-3" />
                        App
                      </button>
                    </div>
                  </FormField>
                  <Show when={agentReleases().length > 0}>
                    <FormField horizontal labelWidth="5rem" label="Agent version">
                      <Select
                        value={editedAgentVersionMode() === "current" ? "latest" : (editedAgentReleaseId() ?? "")}
                        options={[
                          { value: "latest", label: "Always use latest" },
                          ...agentReleases().map((r) => ({ value: r.id, label: r.version })),
                        ]}
                        onChange={(value) => {
                          if (value === "latest") {
                            setEditedAgentVersionMode("current")
                            setEditedAgentReleaseId(null)
                          } else {
                            setEditedAgentVersionMode("fixed")
                            setEditedAgentReleaseId(value)
                          }
                          markDirty()
                        }}
                        class="h-7 text-xs"
                      />
                    </FormField>
                  </Show>
                </div>
              </CollapsibleSection>

              <EnvironmentSection
                triggerId={trigger().id}
                triggerSlug={trigger().slug}
                triggerType={editedType()}
                orgSlug={activeOrg()?.slug ?? ""}
                apiBaseUrl={apiBaseURL}
                environments={trigger().environments}
                availableChannels={props.channels}
                releases={props.releases}
                currentReleaseId={trigger().currentReleaseId}
                payloadSchema={effectivePayloadSchema()}
                onToggle={(envId) => props.onToggleEnvironment?.(trigger().id, envId) ?? Promise.resolve()}
                onRegenerateWebhookSecret={(envId) =>
                  props.onRegenerateWebhookSecret?.(trigger().id, envId) ?? Promise.resolve()
                }
                onRegenerateDebugSecret={(envId) =>
                  props.onRegenerateDebugSecret?.(trigger().id, envId) ?? Promise.resolve()
                }
                onUpdateChannel={(envId, channelId) =>
                  props.onUpdateEnvironmentChannel?.(trigger().id, envId, channelId) ?? Promise.resolve()
                }
                onRemove={(envId) => props.onRemoveEnvironment?.(trigger().id, envId) ?? Promise.resolve()}
                onAdd={() => setAddEnvModalOpen(true)}
              />

              <Show when={editedType() === "schedule"}>
                <CollapsibleSection title="Schedule">
                  <div class="space-y-3">
                    <ScheduleEditor
                      cron={editedCron()}
                      timezone={editedTimezone()}
                      onCronChange={(v) => {
                        setEditedCron(v)
                        markDirty()
                      }}
                      onTimezoneChange={(v) => {
                        setEditedTimezone(v)
                        markDirty()
                      }}
                    />
                  </div>
                </CollapsibleSection>
              </Show>

              <Show when={editedType() === "app"}>
                <CollapsibleSection title="App">
                  <div class="space-y-3">
                    <FormField horizontal labelWidth="5rem" label="Connection">
                      <Select
                        value={editedAppAccountId() ?? ""}
                        options={[
                          ...(props.appAccounts ?? []).map((a) => ({
                            value: a.id,
                            label: a.name,
                            icon: (iconProps: { class?: string }) => (
                              <AppIcon appId={a.appId} class={iconProps.class} />
                            ),
                          })),
                          ...(props.onAppConnect
                            ? [
                                {
                                  value: "__connect_new__",
                                  label: "Connect new",
                                  icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
                                },
                              ]
                            : []),
                        ]}
                        onChange={(value) => {
                          if (value === "__connect_new__") {
                            props.onAppConnect?.(null)
                            return
                          }
                          setEditedAppAccountId(value || null)
                          setEditedAppEvents([])
                          markDirty()
                        }}
                        placeholder="Select connection"
                        class="h-7 text-xs"
                      />
                    </FormField>
                    <Show when={editedAppAccountId()}>
                      <FormField horizontal labelWidth="5rem" label="Events">
                        <MultiSelect
                          values={editedAppEvents()}
                          options={(() => {
                            const account = props.appAccounts?.find((a) => a.id === editedAppAccountId())
                            if (!account) return []
                            return APP_EVENTS[account.appId as keyof typeof APP_EVENTS] ?? []
                          })()}
                          onChange={(v) => {
                            setEditedAppEvents(v)
                            markDirty()
                          }}
                          placeholder="Select events"
                          class="text-xs"
                        />
                      </FormField>
                      <Show when={getAppAccountDetail(selectedAppAccount())}>
                        <FormField horizontal labelWidth="5rem" label="Account">
                          <span class="py-1 text-xs text-text-muted">{getAppAccountDetail(selectedAppAccount())}</span>
                        </FormField>
                      </Show>
                    </Show>
                  </div>
                </CollapsibleSection>
              </Show>

              <PromptSection
                triggerType={editedType()}
                promptMode={promptMode()}
                onPromptModeChange={(v) => {
                  setPromptMode(v)
                  markDirty()
                }}
                prompts={props.prompts.filter((p) => p.agentId === props.trigger?.agentId)}
                selectedPromptId={editedPromptId()}
                onPromptIdChange={(v) => {
                  setEditedPromptId(v)
                  markDirty()
                }}
                promptVersionMode={editedPromptVersionMode()}
                onPromptVersionModeChange={(v) => {
                  setEditedPromptVersionMode(v)
                  markDirty()
                }}
                promptReleases={props.promptReleases ?? []}
                selectedPromptReleaseId={editedPromptReleaseId()}
                onPromptReleaseIdChange={(v) => {
                  setEditedPromptReleaseId(v)
                  markDirty()
                }}
                promptContent={editedPromptContent()}
                onPromptContentChange={(v) => {
                  setEditedPromptContent(v)
                  markDirty()
                }}
                script={editedScript()}
                onScriptChange={(v) => {
                  setEditedScript(v)
                  markDirty()
                }}
                payloadSchema={editedPayloadSchema()}
                onPayloadSchemaChange={(v) => {
                  setEditedPayloadSchema(v)
                  markDirty()
                }}
                currentPromptInputSchema={
                  selectedPrompt()?.id === props.trigger?.prompt?.id ? props.trigger?.prompt?.inputSchema : undefined
                }
                input={editedInput()}
                onInputChange={(v) => {
                  setEditedInput(v)
                  markDirty()
                }}
                inputPlaceholder={inputPlaceholder()}
                appId={selectedAppAccount()?.appId ?? null}
                appEvents={editedAppEvents()}
              />
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
          }
        }}
      />

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
