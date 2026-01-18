import { Show, createSignal, createEffect, createMemo, onCleanup, on, onMount } from "solid-js"
import { useBeforeLeave, useNavigate, useSearchParams } from "@solidjs/router"
import type { AgentRuntimeConfig, AgentTool, TypeDef, ResourceType, SubagentDefinition } from "@synatra/core/types"
import { Skeleton, SkeletonText, PopoverSelect, DropdownMenu, IconButton, type DropdownMenuItem } from "../../../ui"
import { EntityIcon } from "../../../components"
import { Check, DotsThree, SlidersHorizontal, Bug } from "phosphor-solid-js"
import { type AgentDetailProps, type Tab, type SaveStatus, type Selection, type TabItem, getTabKey } from "./constants"
import type { Environments } from "../../../app/api"
import { OutlinePanel } from "./outline-panel"
import { InspectorPanel } from "./inspector-panel"
import {
  CopilotPanel,
  type CopilotProposal,
  type CopilotResourceRequest,
  type CopilotTriggerRequest,
} from "./copilot-panel"
import { GenerateToolsModal } from "./generate-tools-modal"
import { OnboardingVideoModal } from "./inspector/onboarding-video-modal"
import { VersionControl } from "./version-control"
import { DeployDropdown } from "./deploy-dropdown"
import { stableId } from "./utils"
import { serializeConfig } from "@synatra/util/normalize"
import { DebugPanel } from "./debug-panel"
import { ResizablePanel } from "./resizable-panel"
import { ResizableSidebar } from "./resizable-sidebar"
import { createPersistedSignal } from "../../../app/persisted-signal"
import { api } from "../../../app"

export { type AgentDetailProps } from "./constants"

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
          <SlidersHorizontal class="h-7 w-7 opacity-40" weight="regular" />
        </div>
        <p class="text-sm">Select an agent to view details</p>
      </div>
    </div>
  )
}

function EnvironmentSelector(props: {
  environments: Environments
  selectedId: string | null
  onChange?: (id: string) => void
}) {
  const options = () =>
    props.environments.map((e) => ({
      value: e.id,
      label: e.name,
      color: e.color || "var(--color-text-muted)",
    }))

  return (
    <PopoverSelect
      value={props.selectedId ?? undefined}
      options={options()}
      onChange={props.onChange}
      placeholder="Select environment"
    />
  )
}

export function AgentDetail(props: AgentDetailProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams<{
    completeResourceRequest?: string
    resourceId?: string
  }>()
  const [activeTab, setActiveTab] = createSignal<Tab>("configuration")
  const [editedConfig, setEditedConfig] = createSignal<AgentRuntimeConfig | null>(null)
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("idle")
  const [isDirty, setIsDirty] = createSignal(false)
  const [openTabs, setOpenTabs] = createSignal<TabItem[]>([])
  const [activeTabKey, setActiveTabKey] = createSignal<string>("")
  const [lastSavedHash, setLastSavedHash] = createSignal("")
  const [showGenerateModal, setShowGenerateModal] = createSignal(false)
  const [pendingProposal, setPendingProposal] = createSignal<CopilotProposal | null>(null)
  const [pendingResourceRequest, setPendingResourceRequest] = createSignal<CopilotResourceRequest | null>(null)
  const [pendingTriggerRequest, setPendingTriggerRequest] = createSignal<CopilotTriggerRequest | null>(null)
  const [approvingProposal, setApprovingProposal] = createSignal(false)
  const [rejectingProposal, setRejectingProposal] = createSignal(false)
  const [creatingResource, setCreatingResource] = createSignal(false)
  const [approvingTriggerRequest, setApprovingTriggerRequest] = createSignal(false)
  const [cancellingTriggerRequest, setCancellingTriggerRequest] = createSignal(false)
  const [copilotHighlightVisible, setCopilotHighlightVisible] = createSignal(false)
  const [showOnboardingVideoModal, setShowOnboardingVideoModal] = createSignal(false)
  const [videoCurrentTime, setVideoCurrentTime] = createSignal(0)
  const approveHandlerRef = { current: null as (() => void) | null }

  const getWelcomeTabKey = (agentId: string) => `agent-welcome-tab-${agentId}`
  const shouldShowWelcomeTab = (agentId: string) => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(getWelcomeTabKey(agentId)) === "true"
  }
  const setWelcomeTabShown = (agentId: string, shown: boolean) => {
    if (typeof window === "undefined") return
    if (shown) {
      localStorage.setItem(getWelcomeTabKey(agentId), "true")
    } else {
      localStorage.removeItem(getWelcomeTabKey(agentId))
    }
  }
  const rejectHandlerRef = { current: null as (() => void) | null }
  const [debugPanelOpen, setDebugPanelOpen, initDebugPanelOpen] = createPersistedSignal(
    "agent-debug-panel-open",
    (raw) => raw === "true",
  )

  const confirmingResource = createMemo(() => {
    const requestId = searchParams.completeResourceRequest
    const resourceId = searchParams.resourceId
    if (requestId && resourceId) {
      return { requestId, resourceId }
    }
    return null
  })

  onMount(() => {
    initDebugPanelOpen(false)
  })

  const [copilotHighlightFading, setCopilotHighlightFading] = createSignal(false)
  const highlightTimers: ReturnType<typeof setTimeout>[] = []
  let canFadeHighlight = false

  createEffect(() => {
    if (props.showCopilotHighlight && props.agent) {
      setCopilotHighlightVisible(true)
      setCopilotHighlightFading(false)
      canFadeHighlight = false

      highlightTimers.push(
        setTimeout(() => {
          canFadeHighlight = true
        }, 1500),
      )

      highlightTimers.push(
        setTimeout(() => {
          startHighlightFadeOut()
        }, 3000),
      )
    }
  })

  const startHighlightFadeOut = () => {
    if (!copilotHighlightVisible() || copilotHighlightFading()) return
    setCopilotHighlightFading(true)
    highlightTimers.push(
      setTimeout(() => {
        setCopilotHighlightVisible(false)
        props.onCopilotHighlightDismissed?.()
      }, 1000),
    )
  }

  const onCopilotLoadingChange = (loading: boolean) => {
    if (loading && canFadeHighlight) {
      startHighlightFadeOut()
    }
  }

  const dismissCopilotHighlight = () => {
    if (copilotHighlightVisible()) {
      highlightTimers.forEach(clearTimeout)
      highlightTimers.length = 0
      setCopilotHighlightVisible(false)
      setCopilotHighlightFading(false)
      props.onCopilotHighlightDismissed?.()
    }
  }

  onCleanup(() => {
    highlightTimers.forEach(clearTimeout)
  })

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const AUTO_SAVE_DELAY = 1000

  const saveImmediately = async () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    const config = editedConfig()
    if (isDirty() && config && props.agent && props.onSaveWorkingCopy) {
      setSaveStatus("saving")
      try {
        await props.onSaveWorkingCopy(props.agent.id, { runtimeConfig: config })
        setLastSavedHash(serializeConfig(config))
        setIsDirty(false)
        setSaveStatus("saved")
      } catch {
        setSaveStatus("error")
      }
    }
  }

  const scheduleAutoSave = () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }
    autoSaveTimer = setTimeout(() => {
      if (isDirty() && editedConfig()) {
        handleSave()
      }
    }, AUTO_SAVE_DELAY)
  }

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty()) {
      e.preventDefault()
      return ""
    }
  }

  useBeforeLeave((e) => {
    if (isDirty() && editedConfig()) {
      e.preventDefault()
      saveImmediately().then(() => {
        if (saveStatus() !== "error") {
          e.retry(true)
        }
      })
    }
  })

  onCleanup(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }
    window.removeEventListener("beforeunload", handleBeforeUnload)
  })

  createEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload)
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "j" && e.metaKey && props.agent) {
      e.preventDefault()
      setDebugPanelOpen((prev) => !prev)
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown)
  })

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown)
  })

  const selection = (): Selection | null => {
    const key = activeTabKey()
    return openTabs().find((t) => getTabKey(t) === key) ?? null
  }

  const handleSelectItem = (item: TabItem) => {
    const key = getTabKey(item)
    const existing = openTabs().find((t) => getTabKey(t) === key)
    if (!existing) {
      setOpenTabs([...openTabs(), item])
    }
    setActiveTabKey(key)
  }

  const handleCloseTab = (key: string) => {
    const tabs = openTabs()
    const idx = tabs.findIndex((t) => getTabKey(t) === key)
    if (idx === -1) return
    if (key === "onboarding_video" && props.agent) {
      setWelcomeTabShown(props.agent.id, false)
    }
    const newTabs = tabs.filter((t) => getTabKey(t) !== key)
    setOpenTabs(newTabs)
    if (activeTabKey() === key && newTabs.length > 0) {
      const newIdx = Math.min(idx, newTabs.length - 1)
      setActiveTabKey(getTabKey(newTabs[newIdx]))
    }
  }

  createEffect(() => {
    const proposal = pendingProposal()
    if (proposal) {
      const diffTab = openTabs().find((t) => t.type === "diff")
      if (!diffTab) {
        handleSelectItem({ type: "diff" })
      }
    } else {
      const diffTab = openTabs().find((t) => t.type === "diff")
      if (diffTab) {
        handleCloseTab("diff")
      }
    }
  })

  createEffect(() => {
    const request = pendingResourceRequest()
    const confirmation = confirmingResource()
    if (request || confirmation) {
      const connectTab = openTabs().find((t) => t.type === "connect_resource")
      if (!connectTab) {
        handleSelectItem({ type: "connect_resource", requestId: request?.id ?? confirmation?.requestId ?? "" })
      } else {
        setActiveTabKey(getTabKey(connectTab))
      }
    } else {
      const connectTab = openTabs().find((t) => t.type === "connect_resource")
      if (connectTab && connectTab.type === "connect_resource") {
        handleCloseTab(getTabKey(connectTab))
      }
    }
  })

  createEffect(() => {
    const request = pendingTriggerRequest()
    if (request) {
      const triggerTab = openTabs().find((t) => t.type === "trigger_request")
      if (!triggerTab) {
        handleSelectItem({ type: "trigger_request", requestId: request.id })
      } else {
        setActiveTabKey(getTabKey(triggerTab))
      }
    } else {
      const triggerTab = openTabs().find((t) => t.type === "trigger_request")
      if (triggerTab && triggerTab.type === "trigger_request") {
        handleCloseTab(getTabKey(triggerTab))
      }
    }
  })

  createEffect(
    on(
      () => [props.agent?.id, props.workingCopy?.agentId] as const,
      ([agentId, wcAgentId], prev) => {
        const agent = props.agent
        const wc = props.workingCopy
        const prevAgentId = prev?.[0]
        if (agent && agentId !== prevAgentId) {
          const config = wc?.runtimeConfig ?? currentRelease()?.runtimeConfig ?? null
          setEditedConfig(config)
          setLastSavedHash(serializeConfig(config ?? {}))
          setIsDirty(false)
          setSaveStatus("idle")
          setOpenTabs([])
          setActiveTabKey("")
          const showWelcome = props.showCopilotHighlight || shouldShowWelcomeTab(agent.id)
          if (showWelcome) {
            setWelcomeTabShown(agent.id, true)
            setOpenTabs([{ type: "onboarding_video" }])
            setActiveTabKey("onboarding_video")
          }
          return
        }
        if (agent && wc && agentId === wcAgentId && !editedConfig()) {
          const config = wc.runtimeConfig ?? currentRelease()?.runtimeConfig ?? null
          setEditedConfig(config)
          setLastSavedHash(serializeConfig(config ?? {}))
        }
      },
    ),
  )

  createEffect(
    on(
      () => [props.workingCopy?.configHash, props.workingCopy?.runtimeConfig, props.agent?.id] as const,
      ([configHash, runtimeConfig, agentId], prev) => {
        if (!props.agent) return
        if (!runtimeConfig) return
        if (props.agent.id !== agentId) return
        if (isDirty()) return
        const prevHash = prev?.[0]
        if (configHash && prevHash && configHash === prevHash) return
        const currentSerialized = serializeConfig(editedConfig() ?? {})
        const newSerialized = serializeConfig(runtimeConfig)
        if (currentSerialized === newSerialized) return
        setEditedConfig(runtimeConfig)
        setLastSavedHash(newSerialized)
        setIsDirty(false)
        setSaveStatus("idle")
        const onboardingTab = openTabs().find((t) => t.type === "onboarding_video")
        if (onboardingTab) {
          setOpenTabs([onboardingTab])
          setActiveTabKey("onboarding_video")
        } else {
          setOpenTabs([])
          setActiveTabKey("")
        }
      },
    ),
  )

  const handleConfigChange = <K extends keyof AgentRuntimeConfig>(key: K, value: AgentRuntimeConfig[K]) => {
    const config = editedConfig()
    if (!config) return
    const updated = { ...config, [key]: value }
    setEditedConfig(updated)
    const dirty = serializeConfig(updated) !== lastSavedHash()
    setIsDirty(dirty)
    setSaveStatus("idle")
    if (dirty) {
      scheduleAutoSave()
    }
  }

  const handleSave = async () => {
    const config = editedConfig()
    if (!props.agent || !props.onSaveWorkingCopy || !config) return
    const configHash = serializeConfig(config)
    if (configHash === lastSavedHash()) {
      setIsDirty(false)
      return
    }

    setSaveStatus("saving")
    try {
      await props.onSaveWorkingCopy(props.agent.id, { runtimeConfig: config })
      setLastSavedHash(configHash)
      setSaveStatus("saved")
      setIsDirty(false)
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch {
      setSaveStatus("error")
    }
  }

  const hasUndeployedChanges = () => {
    if (isDirty()) {
      const config = editedConfig()
      const releaseConfig = currentRelease()?.runtimeConfig ?? null
      if (!config || !releaseConfig) return false
      return serializeConfig(config) !== serializeConfig(releaseConfig)
    }
    const wcHash = props.workingCopy?.configHash
    const releaseHash = currentRelease()?.configHash
    if (!wcHash || !releaseHash) return false
    return wcHash !== releaseHash
  }

  const canDeploy = () => {
    if (isDirty()) return false
    const wcHash = props.workingCopy?.configHash
    const releaseHash = currentRelease()?.configHash
    if (!wcHash) return false
    if (!releaseHash) return true
    return wcHash !== releaseHash
  }

  const currentRelease = () => props.releases.find((r) => r.id === props.agent?.currentReleaseId)

  const handleDeploy = async (data: { bump: "major" | "minor" | "patch"; description: string }) => {
    const agent = props.agent
    if (!agent || !props.onDeploy) return
    await saveImmediately()
    if (isDirty() || saveStatus() === "error") return
    await props.onDeploy(agent.id, data)
  }

  const addTool = () => {
    const config = editedConfig()
    if (!config) return
    const newIndex = config.tools?.length ?? 0
    const newTool: AgentTool = {
      stableId: stableId(),
      name: `tool${newIndex + 1}`,
      description: "",
      params: {},
      returns: {},
      code: "",
    }
    handleConfigChange("tools", [...(config.tools ?? []), newTool])
    handleSelectItem({ type: "tool", index: newIndex })
  }

  const removeTool = (index: number) => {
    const config = editedConfig()
    if (!config) return

    const currentKey = activeTabKey()
    const closedKey = `tool-${index}`

    const updatedTabs = openTabs()
      .filter((t) => getTabKey(t) !== closedKey)
      .map((t) => {
        if (t.type === "tool" && t.index > index) {
          return { type: "tool" as const, index: t.index - 1 }
        }
        return t
      })

    if (currentKey === closedKey) {
      const closedIdx = openTabs().findIndex((t) => getTabKey(t) === closedKey)
      const newActiveTab = updatedTabs[Math.min(closedIdx, updatedTabs.length - 1)]
      setActiveTabKey(newActiveTab ? getTabKey(newActiveTab) : "")
    } else if (currentKey.startsWith("tool-")) {
      const currentIndex = parseInt(currentKey.replace("tool-", ""), 10)
      if (currentIndex > index) {
        setActiveTabKey(`tool-${currentIndex - 1}`)
      }
    }

    setOpenTabs(updatedTabs)
    const updated = (config.tools ?? []).filter((_, i) => i !== index)
    handleConfigChange("tools", updated)
  }

  const addType = () => {
    const config = editedConfig()
    if (!config) return
    const existing = Object.keys(config.$defs ?? {})
    let idx = 1
    let name = `Type${idx}`
    while (existing.includes(name)) {
      idx++
      name = `Type${idx}`
    }
    handleConfigChange("$defs", { ...(config.$defs ?? {}), [name]: { type: "object", properties: {} } })
    handleSelectItem({ type: "type", name })
  }

  const removeType = (name: string) => {
    const config = editedConfig()
    if (!config) return

    const currentKey = activeTabKey()
    const closedKey = `type-${name}`
    const updatedTabs = openTabs().filter((t) => getTabKey(t) !== closedKey)

    if (currentKey === closedKey) {
      const closedIdx = openTabs().findIndex((t) => getTabKey(t) === closedKey)
      const newActiveTab = updatedTabs[Math.min(closedIdx, updatedTabs.length - 1)]
      setActiveTabKey(newActiveTab ? getTabKey(newActiveTab) : "")
    }

    setOpenTabs(updatedTabs)
    const { [name]: _, ...rest } = config.$defs ?? {}
    handleConfigChange("$defs", rest)
  }

  const renameType = (oldName: string, newName: string) => {
    if (oldName === newName || !newName.trim()) return
    const config = editedConfig()
    if (!config) return
    const defs = config.$defs ?? {}
    if (newName in defs) return
    const { [oldName]: typeDef, ...rest } = defs
    if (!typeDef) return
    handleConfigChange("$defs", { ...rest, [newName]: typeDef })
    handleCloseTab(`type-${oldName}`)
    handleSelectItem({ type: "type", name: newName })
  }

  const addSubagent = () => {
    const config = editedConfig()
    if (!config) return
    const newIndex = config.subagents?.length ?? 0
    const newSubagent: SubagentDefinition = {
      agentId: "",
      description: "",
      versionMode: "current",
    }
    handleConfigChange("subagents", [...(config.subagents ?? []), newSubagent])
    handleSelectItem({ type: "subagent", index: newIndex })
  }

  const removeSubagent = (index: number) => {
    const config = editedConfig()
    if (!config) return

    const currentKey = activeTabKey()
    const closedKey = `subagent-${index}`

    const updatedTabs = openTabs()
      .filter((t) => getTabKey(t) !== closedKey)
      .map((t) => {
        if (t.type === "subagent" && t.index > index) {
          return { type: "subagent" as const, index: t.index - 1 }
        }
        return t
      })

    if (currentKey === closedKey) {
      const closedIdx = openTabs().findIndex((t) => getTabKey(t) === closedKey)
      const newActiveTab = updatedTabs[Math.min(closedIdx, updatedTabs.length - 1)]
      setActiveTabKey(newActiveTab ? getTabKey(newActiveTab) : "")
    } else if (currentKey.startsWith("subagent-")) {
      const currentIndex = parseInt(currentKey.replace("subagent-", ""), 10)
      if (currentIndex > index) {
        setActiveTabKey(`subagent-${currentIndex - 1}`)
      }
    }

    setOpenTabs(updatedTabs)
    const updated = (config.subagents ?? []).filter((_, i) => i !== index)
    handleConfigChange("subagents", updated)
  }

  const handleGenerateTools = (tools: AgentTool[], types: Record<string, TypeDef>) => {
    const config = editedConfig()
    if (!config) return

    const existingTools = config.tools ?? []
    const existingTypes = config.$defs ?? {}
    const existingToolNames = new Set(existingTools.map((t) => t.name))
    const existingTypeNames = new Set(Object.keys(existingTypes))

    const getUniqueName = (name: string, existingNames: Set<string>): string => {
      if (!existingNames.has(name)) return name
      let i = 2
      while (existingNames.has(`${name}${i}`)) i++
      return `${name}${i}`
    }

    const typeNameMap: Record<string, string> = {}
    const renamedTypes: Record<string, TypeDef> = {}
    for (const [name, typeDef] of Object.entries(types)) {
      const newName = getUniqueName(name, existingTypeNames)
      typeNameMap[name] = newName
      existingTypeNames.add(newName)
      renamedTypes[newName] = typeDef
    }

    const renamedTools = tools.map((tool) => {
      const newName = getUniqueName(tool.name, existingToolNames)
      existingToolNames.add(newName)

      let params = tool.params
      let returns = tool.returns
      const paramsRef = params.$ref as string | undefined
      const returnsRef = returns.$ref as string | undefined
      if (paramsRef) {
        const refName = paramsRef.replace("#/$defs/", "")
        if (typeNameMap[refName]) {
          params = { ...params, $ref: `#/$defs/${typeNameMap[refName]}` }
        }
      }
      if (returnsRef) {
        const refName = returnsRef.replace("#/$defs/", "")
        if (typeNameMap[refName]) {
          returns = { ...returns, $ref: `#/$defs/${typeNameMap[refName]}` }
        }
      }

      return { ...tool, name: newName, params, returns }
    })

    handleConfigChange("tools", [...existingTools, ...renamedTools])
    handleConfigChange("$defs", { ...existingTypes, ...renamedTypes })
    if (renamedTools.length > 0) {
      handleSelectItem({ type: "tool", index: existingTools.length })
    }
  }

  const handleResourceCreate = async (data: {
    name: string
    slug?: string
    description?: string
    type: ResourceType
  }): Promise<{ resourceId: string }> => {
    const agent = props.agent
    const request = pendingResourceRequest()
    if (!agent || !request) return { resourceId: "" }

    setCreatingResource(true)
    try {
      const createRes = await api.api.resources.$post({
        json: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          type: data.type,
        },
      })
      if (!createRes.ok) throw new Error("Failed to create resource")
      const resource = await createRes.json()

      navigate(`/resources/${resource.id}?returnTo=agent&agentId=${agent.id}&requestId=${request.id}`)

      return { resourceId: resource.id }
    } finally {
      setCreatingResource(false)
    }
  }

  const handleResourceRequestCancel = async () => {
    const request = pendingResourceRequest()
    if (!request || !props.agent) return

    await api.api.agents[":id"].copilot["resource-requests"][":requestId"].cancel.$post({
      param: { id: props.agent.id, requestId: request.id },
    })
    setPendingResourceRequest(null)
  }

  const handleResourceConfirmationComplete = async (requestId: string, resourceId: string) => {
    if (!props.agent) return

    const resourceRes = await api.api.resources[":id"].$get({ param: { id: resourceId } })
    if (!resourceRes.ok) throw new Error("Failed to fetch resource")
    const resource = await resourceRes.json()

    const completeRes = await api.api.agents[":id"].copilot["resource-requests"][":requestId"].complete.$post({
      param: { id: props.agent.id, requestId },
      json: { resourceId, resourceSlug: resource.slug },
    })
    if (!completeRes.ok) throw new Error("Failed to complete resource request")

    setSearchParams({ completeResourceRequest: undefined, resourceId: undefined }, { replace: true })
    setPendingResourceRequest(null)
  }

  const handleTriggerRequestApprove = async (requestId: string) => {
    if (!props.agent) return

    setApprovingTriggerRequest(true)
    try {
      const res = await api.api.agents[":id"].copilot["trigger-requests"][":requestId"].complete.$post({
        param: { id: props.agent.id, requestId },
      })
      if (!res.ok) throw new Error("Failed to approve trigger request")
    } finally {
      setApprovingTriggerRequest(false)
    }
  }

  const handleTriggerRequestCancel = async (requestId: string) => {
    if (!props.agent) return

    setCancellingTriggerRequest(true)
    try {
      await api.api.agents[":id"].copilot["trigger-requests"][":requestId"].cancel.$post({
        param: { id: props.agent.id, requestId },
      })
    } finally {
      setCancellingTriggerRequest(false)
    }
  }

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden bg-surface-elevated"
      classList={{ "agent-detail-fade-in": props.showCopilotHighlight }}
    >
      <Show when={props.loading}>
        <LoadingState />
      </Show>
      <Show when={!props.loading && !props.agent}>
        <EmptyState />
      </Show>
      <Show when={!props.loading && props.agent}>
        {(agent) => (
          <>
            <div class="flex items-center justify-between border-b border-border px-3 py-2">
              <div class="flex items-center gap-2">
                <EntityIcon icon={agent().icon} iconColor={agent().iconColor} size={24} />
                <h1 class="text-[13px] font-medium text-text">{agent().name}</h1>
                <VersionControl
                  currentVersion={agent().version}
                  currentReleaseId={agent().currentReleaseId}
                  releases={props.releases}
                  hasUndeployedChanges={hasUndeployedChanges()}
                  workingCopyUpdatedAt={props.workingCopy?.updatedAt}
                  onAdopt={(releaseId) => props.onAdopt?.(agent().id, releaseId)}
                  onCheckout={(releaseId) => props.onCheckout?.(agent().id, releaseId)}
                />
                <Show when={props.onEdit || props.onDelete}>
                  <DropdownMenu
                    items={[
                      ...(props.onEdit
                        ? [{ type: "item" as const, label: "Edit details", onClick: () => props.onEdit?.() }]
                        : []),
                      ...(props.onEdit && props.onDelete ? [{ type: "separator" as const }] : []),
                      ...(props.onDelete
                        ? [
                            {
                              type: "item" as const,
                              label: "Delete",
                              onClick: () => props.onDelete?.(agent().id),
                              variant: "danger" as const,
                            },
                          ]
                        : []),
                    ]}
                    trigger={
                      <IconButton variant="ghost" size="sm">
                        <DotsThree class="h-4 w-4" />
                      </IconButton>
                    }
                  />
                </Show>
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
                <DeployDropdown currentVersion={agent().version} disabled={!canDeploy()} onDeploy={handleDeploy} />
              </div>
            </div>

            <div class="flex items-center border-b border-border px-3">
              <div class="flex items-center gap-4">
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
                  class="-mb-px border-b px-0.5 py-2 text-xs font-medium transition-colors"
                  classList={{
                    "border-accent text-text": activeTab() === "logs",
                    "border-transparent text-text-muted hover:text-text": activeTab() !== "logs",
                  }}
                  onClick={() => setActiveTab("logs")}
                >
                  Logs
                </button>
              </div>
            </div>

            <div class="flex flex-1 overflow-hidden">
              <Show when={activeTab() === "configuration"}>
                <div class="flex flex-1 overflow-hidden">
                  <ResizableSidebar
                    side="right"
                    defaultWidth={208}
                    minWidth={160}
                    maxWidth={320}
                    storageKey="agent-outline-panel-width"
                  >
                    <OutlinePanel
                      config={editedConfig()}
                      agentName={agent().name}
                      agents={props.agents}
                      selection={selection()}
                      onSelect={handleSelectItem}
                      onAddTool={addTool}
                      onGenerateFromDatabase={() => setShowGenerateModal(true)}
                      onRemoveTool={removeTool}
                      onAddType={addType}
                      onRemoveType={removeType}
                      onAddSubagent={addSubagent}
                      onRemoveSubagent={removeSubagent}
                    />
                  </ResizableSidebar>
                  <div class="flex flex-1 min-w-0 flex-col overflow-hidden border-l border-border">
                    <div class="flex-1 min-w-0 overflow-hidden">
                      <InspectorPanel
                        agentId={agent().id}
                        agentName={agent().name}
                        agentSlug={agent().slug}
                        agents={props.agents}
                        config={editedConfig()}
                        environmentId={props.selectedEnvironmentId}
                        openTabs={openTabs()}
                        activeTabKey={activeTabKey()}
                        onSelectTab={setActiveTabKey}
                        onCloseTab={handleCloseTab}
                        onConfigChange={handleConfigChange}
                        onTypeRename={renameType}
                        pendingProposal={pendingProposal()}
                        onApproveProposal={() => approveHandlerRef.current?.()}
                        onRejectProposal={() => rejectHandlerRef.current?.()}
                        approvingProposal={approvingProposal()}
                        rejectingProposal={rejectingProposal()}
                        pendingResourceRequest={pendingResourceRequest()}
                        onResourceCreate={handleResourceCreate}
                        onResourceRequestCancel={handleResourceRequestCancel}
                        creatingResource={creatingResource()}
                        confirmingResource={confirmingResource()}
                        onConfirmationComplete={handleResourceConfirmationComplete}
                        pendingTriggerRequest={pendingTriggerRequest()}
                        onTriggerRequestApprove={handleTriggerRequestApprove}
                        onTriggerRequestCancel={handleTriggerRequestCancel}
                        approvingTriggerRequest={approvingTriggerRequest()}
                        cancellingTriggerRequest={cancellingTriggerRequest()}
                        onOpenVideoModal={() => setShowOnboardingVideoModal(true)}
                      />
                    </div>
                    <Show when={debugPanelOpen()}>
                      <ResizablePanel
                        defaultHeight={320}
                        minHeight={100}
                        maxHeight={1000}
                        storageKey="agent-debug-panel-height"
                      >
                        <DebugPanel
                          agentId={agent().id}
                          environmentId={props.selectedEnvironmentId}
                          runtimeConfig={editedConfig()}
                          agent={{ icon: agent().icon, iconColor: agent().iconColor, name: agent().name }}
                        />
                      </ResizablePanel>
                    </Show>
                  </div>

                  <ResizableSidebar
                    side="left"
                    defaultWidth={520}
                    minWidth={360}
                    maxWidth={720}
                    storageKey="agent-copilot-panel-width"
                  >
                    <div
                      class="relative flex h-full flex-col border-l border-border bg-surface-elevated"
                      onClick={dismissCopilotHighlight}
                    >
                      <Show when={copilotHighlightVisible()}>
                        <div
                          class="copilot-highlight-overlay"
                          classList={{ "is-visible": !copilotHighlightFading(), "is-fading": copilotHighlightFading() }}
                        />
                      </Show>
                      <CopilotPanel
                        agentId={agent().id}
                        templateId={agent().templateId}
                        environmentId={props.selectedEnvironmentId}
                        currentConfig={editedConfig()}
                        startCopilot={props.startCopilot}
                        onStartCopilotHandled={props.onStartCopilotHandled}
                        onApply={(config) => {
                          setEditedConfig(config)
                          const dirty = serializeConfig(config) !== lastSavedHash()
                          setIsDirty(dirty)
                          if (dirty) scheduleAutoSave()
                        }}
                        onProposalChange={setPendingProposal}
                        onResourceRequestChange={setPendingResourceRequest}
                        onTriggerRequestChange={setPendingTriggerRequest}
                        onApprovingChange={setApprovingProposal}
                        onRejectingChange={setRejectingProposal}
                        onLoadingChange={onCopilotLoadingChange}
                        approveRef={approveHandlerRef}
                        rejectRef={rejectHandlerRef}
                      />
                    </div>
                  </ResizableSidebar>
                </div>
              </Show>

              <Show when={activeTab() === "logs"}>
                <div class="flex h-64 flex-1 items-center justify-center text-sm text-text-muted">Logs coming soon</div>
              </Show>
            </div>

            <div class="flex h-6 shrink-0 items-center justify-between border-t border-border bg-surface px-1">
              <Show when={props.environments.length > 0}>
                <EnvironmentSelector
                  environments={props.environments}
                  selectedId={props.selectedEnvironmentId}
                  onChange={props.onEnvironmentChange}
                />
              </Show>
              <Show when={props.environments.length === 0}>
                <span />
              </Show>
              <button
                type="button"
                class="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] transition-colors"
                classList={{
                  "bg-accent/10 text-accent": debugPanelOpen(),
                  "text-text-muted hover:text-text hover:bg-surface-muted": !debugPanelOpen(),
                }}
                onClick={() => setDebugPanelOpen((prev) => !prev)}
                title="Toggle Debug Panel (⌘J)"
              >
                <Bug class="h-3 w-3" weight={debugPanelOpen() ? "fill" : "regular"} />
                <span>Debug</span>
                <span class="ml-1 rounded bg-surface-muted px-1 py-0.5 text-[9px] text-text-muted">⌘J</span>
              </button>
            </div>
          </>
        )}
      </Show>

      <GenerateToolsModal
        open={showGenerateModal()}
        onClose={() => setShowGenerateModal(false)}
        onGenerate={handleGenerateTools}
      />

      <OnboardingVideoModal
        open={showOnboardingVideoModal()}
        onClose={() => setShowOnboardingVideoModal(false)}
        currentTime={videoCurrentTime()}
        onTimeUpdate={setVideoCurrentTime}
      />
    </div>
  )
}
