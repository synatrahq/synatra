import { Show, For } from "solid-js"
import {
  X,
  Code,
  BracketsCurly,
  ChatCircle,
  Brain,
  Gear,
  GitDiff,
  Database,
  Lightning,
  UsersThree,
} from "phosphor-solid-js"
import type { AgentRuntimeConfig, AgentTool, TypeDef, SubagentDefinition } from "@synatra/core/types"
import { getSystemTools, type SystemToolDefinition } from "@synatra/core/system-tools"
import type { Agents } from "../../../app/api"
import type { UserConfigurableResourceType } from "@synatra/core/types"
import type { TabItem } from "./constants"
import { getTabKey, getTabLabel } from "./constants"
import { DiffInspector } from "./diff-inspector"
import { ResourceConnectionWizard } from "./resource-connection-wizard"
import { TriggerRequestWizard } from "./trigger-request-wizard"
import type { CopilotResourceRequest, CopilotTriggerRequest } from "./copilot-panel/types"
import { ModelInspector, type ExecutionLimits } from "./inspector/model-inspector"
import { PromptInspector } from "./inspector/prompt-inspector"
import { ToolInspector } from "./inspector/tool-inspector"
import { TypeInspector } from "./inspector/type-inspector"
import { SubagentInspector } from "./inspector/subagent-inspector"
import { SystemToolInspector } from "./inspector/system-tool-inspector"

type CopilotProposal = {
  id: string
  config: AgentRuntimeConfig
  explanation: string
  status: "pending" | "approved" | "rejected"
  createdAt: string
}

type InspectorPanelProps = {
  agentId: string
  agentName: string
  agentSlug: string
  agents: Agents
  config: AgentRuntimeConfig | null
  environmentId?: string | null
  openTabs: TabItem[]
  activeTabKey: string
  onSelectTab: (key: string) => void
  onCloseTab: (key: string) => void
  onConfigChange: <K extends keyof AgentRuntimeConfig>(key: K, value: AgentRuntimeConfig[K]) => void
  onTypeRename: (oldName: string, newName: string) => void
  pendingProposal?: CopilotProposal | null
  onApproveProposal?: () => void
  onRejectProposal?: () => void
  approvingProposal?: boolean
  rejectingProposal?: boolean
  pendingResourceRequest?: CopilotResourceRequest | null
  onResourceCreate?: (data: {
    name: string
    slug?: string
    description?: string
    type: UserConfigurableResourceType
  }) => Promise<{ resourceId: string }>
  onResourceRequestCancel?: () => void
  creatingResource?: boolean
  confirmingResource?: { requestId: string; resourceId: string } | null
  onConfirmationComplete?: (requestId: string, resourceId: string) => Promise<void>
  pendingTriggerRequest?: CopilotTriggerRequest | null
  onTriggerRequestApprove?: (requestId: string) => Promise<void>
  onTriggerRequestCancel?: (requestId: string) => Promise<void>
  approvingTriggerRequest?: boolean
  cancellingTriggerRequest?: boolean
}

function getTabIcon(tab: TabItem) {
  if (tab.type === "tool") return Code
  if (tab.type === "type") return BracketsCurly
  if (tab.type === "prompt") return ChatCircle
  if (tab.type === "model") return Brain
  if (tab.type === "system_tool") return Gear
  if (tab.type === "subagent") return UsersThree
  if (tab.type === "diff") return GitDiff
  if (tab.type === "connect_resource") return Database
  if (tab.type === "trigger_request") return Lightning
  return Brain
}

function getTabIconClass(tab: TabItem): string {
  if (tab.type === "tool") return "text-success"
  if (tab.type === "type") return "text-accent"
  if (tab.type === "prompt") return "text-accent"
  if (tab.type === "model") return "text-text-muted"
  if (tab.type === "system_tool") return "text-text-muted"
  if (tab.type === "subagent") return "text-warning"
  if (tab.type === "diff") return "text-warning"
  if (tab.type === "connect_resource") return "text-accent"
  if (tab.type === "trigger_request") return "text-warning"
  return "text-text-muted"
}

export function InspectorPanel(props: InspectorPanelProps) {
  const updateTool = (index: number, tool: AgentTool) => {
    if (!props.config) return
    const updated = [...(props.config.tools ?? [])]
    updated[index] = tool
    props.onConfigChange("tools", updated)
  }

  const updateType = (name: string, typeDef: TypeDef) => {
    if (!props.config) return
    const updated = { ...(props.config.$defs ?? {}), [name]: typeDef }
    props.onConfigChange("$defs", updated)
  }

  const updateSubagent = (index: number, subagent: SubagentDefinition) => {
    if (!props.config) return
    const updated = [...(props.config.subagents ?? [])]
    updated[index] = subagent
    props.onConfigChange("subagents", updated)
  }

  const activeTab = () => props.openTabs.find((t) => getTabKey(t) === props.activeTabKey)
  const activeFunctionIndex = () => {
    const tab = activeTab()
    return tab?.type === "tool" ? tab.index : -1
  }
  const activeTypeName = () => {
    const tab = activeTab()
    return tab?.type === "type" ? tab.name : null
  }
  const activeSystemToolName = () => {
    const tab = activeTab()
    return tab?.type === "system_tool" ? tab.name : null
  }
  const activeSubagentIndex = () => {
    const tab = activeTab()
    return tab?.type === "subagent" ? tab.index : -1
  }

  const availableRefs = () => Object.keys(props.config?.$defs ?? {})

  return (
    <div class="flex h-full flex-col bg-surface-elevated">
      <Show when={props.openTabs.length > 0}>
        <div class="flex h-8 items-center overflow-x-auto border-b border-border bg-surface-elevated scrollbar-none">
          <For each={props.openTabs}>
            {(tab) => {
              const key = getTabKey(tab)
              const isValid = () => {
                if (tab.type === "tool") {
                  return (props.config?.tools?.length ?? 0) > tab.index
                }
                if (tab.type === "type") {
                  return tab.name in (props.config?.$defs ?? {})
                }
                if (tab.type === "system_tool") {
                  return getSystemTools().some((t: SystemToolDefinition) => t.name === tab.name)
                }
                if (tab.type === "subagent") {
                  return (props.config?.subagents?.length ?? 0) > tab.index
                }
                return true
              }
              const isActive = () => props.activeTabKey === key
              const Icon = getTabIcon(tab)
              return (
                <Show when={isValid()}>
                  <div
                    class="group flex h-full shrink-0 cursor-pointer items-center gap-1 px-2.5 text-xs transition-colors"
                    classList={{
                      "bg-surface-muted text-text": isActive(),
                      "text-text-muted hover:text-text hover:bg-surface-muted": !isActive(),
                    }}
                    onClick={() => props.onSelectTab(key)}
                  >
                    <Icon class={`h-3.5 w-3.5 shrink-0 ${getTabIconClass(tab)}`} weight="duotone" />
                    <span class="max-w-[120px] truncate">{getTabLabel(tab, props.config, props.agents)}</span>
                    <button
                      type="button"
                      class="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
                      classList={{ "opacity-100": isActive() }}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onCloseTab(key)
                      }}
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                </Show>
              )
            }}
          </For>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show
          when={activeTab() && props.config}
          fallback={
            <div class="flex h-full items-center justify-center text-xs text-text-muted">
              Select an item from the outline
            </div>
          }
        >
          <Show when={activeTab()?.type === "model"}>
            <ModelInspector
              model={props.config!.model}
              limits={{
                maxIterations: props.config!.maxIterations,
                maxToolCallsPerIteration: props.config!.maxToolCallsPerIteration,
                maxActiveTimeMs: props.config!.maxActiveTimeMs,
                humanRequestTimeoutMs: props.config!.humanRequestTimeoutMs,
              }}
              environmentId={props.environmentId}
              onUpdate={(model) => props.onConfigChange("model", model)}
              onUpdateLimits={(limits: ExecutionLimits) => {
                if (limits.maxIterations !== props.config!.maxIterations) {
                  props.onConfigChange("maxIterations", limits.maxIterations)
                }
                if (limits.maxToolCallsPerIteration !== props.config!.maxToolCallsPerIteration) {
                  props.onConfigChange("maxToolCallsPerIteration", limits.maxToolCallsPerIteration)
                }
                if (limits.maxActiveTimeMs !== props.config!.maxActiveTimeMs) {
                  props.onConfigChange("maxActiveTimeMs", limits.maxActiveTimeMs)
                }
                if (limits.humanRequestTimeoutMs !== props.config!.humanRequestTimeoutMs) {
                  props.onConfigChange("humanRequestTimeoutMs", limits.humanRequestTimeoutMs)
                }
              }}
            />
          </Show>
          <Show when={activeTab()?.type === "prompt"}>
            <PromptInspector
              systemPrompt={props.config!.systemPrompt}
              onUpdatePrompt={(prompt) => props.onConfigChange("systemPrompt", prompt)}
            />
          </Show>
          <Show when={activeFunctionIndex() >= 0}>
            {(() => {
              const tool = () => props.config!.tools?.[activeFunctionIndex()]
              const toolNames = () => props.config!.tools?.map((t) => t.name) ?? []
              return (
                <Show when={tool()}>
                  <ToolInspector
                    tool={tool()!}
                    index={activeFunctionIndex()}
                    availableRefs={availableRefs()}
                    existingNames={toolNames()}
                    onUpdate={(t) => updateTool(activeFunctionIndex(), t)}
                  />
                </Show>
              )
            })()}
          </Show>
          <Show when={activeTypeName()}>
            {(name) => {
              const typeDef = () => props.config!.$defs?.[name()]
              return (
                <Show when={typeDef()}>
                  <TypeInspector
                    name={name()}
                    typeDef={typeDef()!}
                    availableRefs={availableRefs()}
                    onUpdate={(td) => updateType(name(), td)}
                    onRename={(newName) => props.onTypeRename(name(), newName)}
                  />
                </Show>
              )
            }}
          </Show>
          <Show when={activeSystemToolName()}>
            {(name) => {
              const tool = () => getSystemTools().find((t: SystemToolDefinition) => t.name === name())
              return (
                <Show when={tool()}>
                  <SystemToolInspector tool={tool()!} />
                </Show>
              )
            }}
          </Show>
          <Show when={activeSubagentIndex() >= 0}>
            {(() => {
              const subagent = () => props.config!.subagents?.[activeSubagentIndex()]
              return (
                <Show when={subagent()}>
                  <SubagentInspector
                    subagent={subagent()!}
                    agents={props.agents}
                    currentAgentId={props.agentId}
                    onUpdate={(s) => updateSubagent(activeSubagentIndex(), s)}
                  />
                </Show>
              )
            })()}
          </Show>
          <Show when={activeTab()?.type === "diff" && props.pendingProposal && props.config}>
            <DiffInspector
              before={props.config!}
              after={props.pendingProposal!.config}
              onApprove={() => props.onApproveProposal?.()}
              onReject={() => props.onRejectProposal?.()}
              approving={props.approvingProposal ?? false}
              rejecting={props.rejectingProposal ?? false}
            />
          </Show>
          <Show
            when={
              activeTab()?.type === "connect_resource" && (props.pendingResourceRequest || props.confirmingResource)
            }
          >
            <ResourceConnectionWizard
              request={props.pendingResourceRequest!}
              confirmingResource={props.confirmingResource}
              onComplete={async (data) => {
                if (!props.onResourceCreate) return { resourceId: "" }
                return props.onResourceCreate(data)
              }}
              onConfirmationComplete={props.onConfirmationComplete}
              onCancel={() => props.onResourceRequestCancel?.()}
              saving={props.creatingResource}
            />
          </Show>
          <Show when={activeTab()?.type === "trigger_request" && props.pendingTriggerRequest}>
            <TriggerRequestWizard
              request={props.pendingTriggerRequest!}
              onApprove={async (requestId) => {
                if (!props.onTriggerRequestApprove) return
                await props.onTriggerRequestApprove(requestId)
              }}
              onCancel={async (requestId) => {
                if (!props.onTriggerRequestCancel) return
                await props.onTriggerRequestCancel(requestId)
              }}
              approving={props.approvingTriggerRequest}
              cancelling={props.cancellingTriggerRequest}
            />
          </Show>
        </Show>
      </div>
    </div>
  )
}
