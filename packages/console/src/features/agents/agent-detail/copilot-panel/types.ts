import type {
  AgentRuntimeConfig,
  CopilotToolCall,
  CopilotQuestion,
  AskQuestionsResult,
  CopilotQuestionResult,
} from "@synatra/core/types"

export type CopilotThread = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type CopilotMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: CopilotToolCall[] | null
  createdAt: string
}

export type CopilotProposal = {
  id: string
  config: AgentRuntimeConfig
  explanation: string
  status: "pending" | "approved" | "rejected"
  createdAt: string
}

export type CopilotResourceRequestSuggestion = {
  type: "postgres" | "mysql" | "stripe" | "github" | "intercom" | "restapi"
  reason: string
}

export type CopilotResourceRequest = {
  id: string
  explanation: string
  suggestions: CopilotResourceRequestSuggestion[]
  status: "pending" | "completed" | "cancelled"
  resourceId?: string | null
  createdAt: string
}

export type CopilotTriggerConfig = {
  name?: string
  type?: "webhook" | "schedule" | "app"
  cron?: string | null
  timezone?: string
  template?: string
  script?: string
  mode?: "prompt" | "template" | "script"
  appAccountId?: string | null
  appEvents?: string[] | null
}

export type CopilotTriggerRequest = {
  id: string
  action: "create" | "update"
  triggerId?: string | null
  explanation: string
  config: CopilotTriggerConfig
  status: "pending" | "completed" | "cancelled"
  createdAt: string
}

export type StreamStatus = "idle" | "connecting" | "thinking" | "reasoning" | "tool_call" | "streaming"

export type ToolCallStreaming = {
  toolCallId: string
  toolName: string
  argsText: string
  status: "streaming" | "executing" | "completed"
}

export type InFlightState = {
  status: "idle" | "thinking" | "reasoning" | "tool_call" | "streaming"
  reasoningText: string
  streamingText: string
  toolCalls: ToolCallStreaming[]
} | null

export type CopilotToolLog = {
  id: string
  toolName: string
  toolCallId: string | null
  status: "started" | "succeeded" | "failed"
  latencyMs: number | null
  error: string | null
  createdAt: string
}

export type CopilotModel = { id: string; name: string }

export type CopilotQuestionRequest = {
  toolCallId: string
  questions: CopilotQuestion[]
}

export { type CopilotQuestion, type AskQuestionsResult, type CopilotQuestionResult }

export type CopilotPanelProps = {
  agentId: string
  templateId?: string | null
  environmentId: string | null
  currentConfig: AgentRuntimeConfig | null
  startCopilot?: boolean
  onStartCopilotHandled?: () => void
  onApply: (config: AgentRuntimeConfig) => void
  onProposalChange?: (proposal: CopilotProposal | null) => void
  onResourceRequestChange?: (request: CopilotResourceRequest | null) => void
  onTriggerRequestChange?: (request: CopilotTriggerRequest | null) => void
  onApprovingChange?: (approving: boolean) => void
  onRejectingChange?: (rejecting: boolean) => void
  onLoadingChange?: (loading: boolean) => void
  approveRef?: { current: (() => void) | null }
  rejectRef?: { current: (() => void) | null }
}
