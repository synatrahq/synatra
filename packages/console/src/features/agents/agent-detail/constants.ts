import type { AgentRuntimeConfig } from "@synatra/core/types"
import type { Agent, Agents, AgentReleases, AgentWorkingCopy, Environments } from "../../../app/api"

export type AgentDetailProps = {
  agent: Agent | null
  agents: Agents
  releases: AgentReleases
  workingCopy: AgentWorkingCopy | null
  environments: Environments
  selectedEnvironmentId: string | null
  loading?: boolean
  startCopilot?: boolean
  onStartCopilotHandled?: () => void
  showCopilotHighlight?: boolean
  onCopilotHighlightDismissed?: () => void
  onEdit?: () => void
  onDelete?: (id: string) => void
  onSaveWorkingCopy?: (id: string, data: { runtimeConfig: AgentRuntimeConfig }) => Promise<void>
  onDeploy?: (
    agentId: string,
    data: { version?: string; bump?: "major" | "minor" | "patch"; description: string },
  ) => Promise<void>
  onAdopt?: (agentId: string, releaseId: string) => Promise<void>
  onCheckout?: (agentId: string, releaseId: string) => Promise<void>
  onRefresh?: () => Promise<void>
  onEnvironmentChange?: (environmentId: string) => void
}

export type Tab = "configuration" | "logs"
export type SaveStatus = "idle" | "saving" | "saved" | "error"

export type ToolSelection = { type: "tool"; index: number }
export type TypeSelection = { type: "type"; name: string }
export type PromptSelection = { type: "prompt" }
export type ModelSelection = { type: "model" }
export type SystemToolSelection = { type: "system_tool"; name: string }
export type SubagentSelection = { type: "subagent"; index: number }
export type DiffSelection = { type: "diff" }
export type ConnectResourceSelection = { type: "connect_resource"; requestId: string }
export type TriggerRequestSelection = { type: "trigger_request"; requestId: string }
export type OnboardingVideoSelection = { type: "onboarding_video" }
export type Selection =
  | ToolSelection
  | TypeSelection
  | PromptSelection
  | ModelSelection
  | SystemToolSelection
  | SubagentSelection
  | DiffSelection
  | ConnectResourceSelection
  | TriggerRequestSelection
  | OnboardingVideoSelection

export type TabItem = Selection

export function getTabKey(tab: TabItem): string {
  if (tab.type === "tool") return `tool-${tab.index}`
  if (tab.type === "type") return `type-${tab.name}`
  if (tab.type === "system_tool") return `system_tool-${tab.name}`
  if (tab.type === "subagent") return `subagent-${tab.index}`
  if (tab.type === "diff") return "diff"
  if (tab.type === "connect_resource") return `connect_resource-${tab.requestId}`
  if (tab.type === "trigger_request") return `trigger_request-${tab.requestId}`
  if (tab.type === "onboarding_video") return "onboarding_video"
  return tab.type
}

export function getTabLabel(tab: TabItem, config: AgentRuntimeConfig | null, agents?: Agents): string {
  if (tab.type === "tool") {
    const tool = config?.tools?.[tab.index]
    return tool?.name ? `${tool.name}()` : "Tool"
  }
  if (tab.type === "type") return tab.name
  if (tab.type === "prompt") return "Prompt"
  if (tab.type === "model") return "Model"
  if (tab.type === "system_tool") return `${tab.name}()`
  if (tab.type === "subagent") {
    const subagent = config?.subagents?.[tab.index]
    if (!subagent) return "Subagent"
    const agent = agents?.find((a) => a.id === subagent.agentId)
    return agent?.name ?? "Subagent"
  }
  if (tab.type === "diff") return "Changes"
  if (tab.type === "connect_resource") return "Connect Resource"
  if (tab.type === "trigger_request") return "Trigger Request"
  if (tab.type === "onboarding_video") return "Welcome"
  return "Unknown"
}
