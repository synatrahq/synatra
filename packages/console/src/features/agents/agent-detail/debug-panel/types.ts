import type { AgentRuntimeConfig } from "@synatra/core/types"
import type {
  PlaygroundMessage,
  PlaygroundOutputItem,
  PlaygroundHumanRequest,
  PlaygroundHumanResponse,
} from "../../../../app/api"
import type { ToolStatus, SubagentInfo, AgentStatus } from "../../../../components"

export type ToolPair = {
  call: PlaygroundMessage
  result: PlaygroundMessage | null
  humanRequest?: PlaygroundHumanRequest
  status: ToolStatus
}

export type SubagentHumanRequestItem = {
  request: PlaygroundHumanRequest
  response?: PlaygroundHumanResponse
}

export type PlaygroundRun = {
  id: string
  threadId: string
  parentRunId: string | null
  agentId: string
  agentReleaseId: string | null
  depth: number
  status: string
  input: Record<string, unknown>
  output: unknown
  error: string | null
  startedAt: string | null
  createdAt: string
  updatedAt: string
  agent: { id: string; name: string; icon: string | null; iconColor: string | null } | null
}

export type SubagentWork = {
  run: PlaygroundRun
  tools: ToolPair[]
  outputs: PlaygroundOutputItem[]
  status: AgentStatus
  humanRequests: SubagentHumanRequestItem[]
  rejected?: boolean
  rejectReason?: string | null
}

export type HumanRequestItem = {
  request: PlaygroundHumanRequest
  response?: PlaygroundHumanResponse
}

export type TimelineItem =
  | { type: "user"; message: PlaygroundMessage }
  | {
      type: "agent"
      message?: PlaygroundMessage
      createdAt: string
      tools: ToolPair[]
      outputs: PlaygroundOutputItem[]
      pendingHumanRequest: PlaygroundHumanRequest | null
      status: AgentStatus
      delegatedTo: SubagentInfo | null
      subagentWorks: SubagentWork[]
      summary?: string
      humanRequests?: HumanRequestItem[]
    }
  | { type: "rejection"; reason: string | null; createdAt: string }

export type Agent = {
  icon: string | null
  iconColor: string | null
  name: string
}

export type DebugPanelProps = {
  agentId: string
  environmentId: string | null
  runtimeConfig: AgentRuntimeConfig | null
  agent?: Agent | null
}

export type DebugPanelTab = "chat" | "tool_tester"

export type ToolTestResult = {
  ok: boolean
  result?: unknown
  error?: string
  logs: unknown[][]
  durationMs: number
}

export type ToolTesterProps = {
  agentId: string
  environmentId: string | null
  runtimeConfig: AgentRuntimeConfig | null
}
