import type {
  AgentRuntimeConfig,
  AgentTool,
  ApprovalAuthority,
  ThreadStatus,
  MessageType,
  ToolCallData,
  ToolResultData,
  ToolCallRecord,
  ScriptResult,
  OutputKind,
  RunStatus,
  LlmProvider,
} from "@synatra/core/types"
import type { ConversationMessage, ResolvedSubagent, ResolvedLlmConfig } from "./types"

export type VersionMode = "current" | "fixed"

export interface LoadAgentConfigInput {
  agentId: string
  agentReleaseId?: string
  agentVersionMode: VersionMode
  triggerId?: string
  organizationId: string
  runtimeConfigOverride?: AgentRuntimeConfig
}

export type PromptConfig =
  | { mode: "template"; template: string }
  | { mode: "script"; script: string; source: "trigger" | "prompt" }
  | null

export interface LoadAgentConfigResult {
  agentId: string
  agentReleaseId: string
  agentConfig: AgentRuntimeConfig
  agentConfigHash: string
  promptConfig: PromptConfig
  resolvedSubagents: ResolvedSubagent[]
}

export interface ApplyPromptInput {
  prompt: string
  payload: Record<string, unknown>
}

export interface ApplyPromptResult {
  messages: ConversationMessage[]
}

export interface ResolveLlmConfigInput {
  organizationId: string
  environmentId: string
  provider: LlmProvider
}

export interface ResolveLlmConfigResult {
  config: ResolvedLlmConfig | null
}

export interface CallLLMInput {
  agentConfig: AgentRuntimeConfig
  messages: ConversationMessage[]
  timeoutMs?: number
  depth?: number
  subagents?: Array<{
    agentId: string
    alias: string
    description: string
    versionMode: "current" | "fixed"
    releaseId?: string
  }>
  llmConfig: ResolvedLlmConfig
}

export type CallLLMResult =
  | {
      type: "text"
      content: string
      rawResponse: unknown
      durationMs: number
      usage?: { inputTokens: number; outputTokens: number }
    }
  | {
      type: "tool_calls"
      toolCalls: ToolCallRecord[]
      rawResponse: unknown
      durationMs: number
      usage?: { inputTokens: number; outputTokens: number }
    }
  | { type: "error"; reason: "timeout" | "abort"; error: string; durationMs: number }

export interface EvaluateToolRulesInput {
  tool: AgentTool
}

export interface EvaluateToolRulesResult {
  requiresReview: boolean
  approvalAuthority: ApprovalAuthority
  selfApproval: boolean
  approvalTimeoutMs: number
}

export interface ExecuteFunctionInput {
  agentId: string
  agentReleaseId?: string
  toolName: string
  params: Record<string, unknown>
  organizationId: string
  environmentId: string
  maxTimeoutMs?: number
  runtimeConfig?: AgentRuntimeConfig
}

export type ExecuteFunctionResult =
  | { ok: true; result: unknown; logs: unknown[][]; durationMs: number }
  | { ok: false; error: string; durationMs: number }

export interface ExecuteScriptInput {
  script: string
  payload: Record<string, unknown>
  paramAlias: "payload" | "input"
  organizationId: string
  environmentId: string
  timeout?: number
}

export type ExecuteScriptResult =
  | { ok: true; result: ScriptResult; logs: unknown[][]; durationMs: number }
  | { ok: false; error: string; durationMs: number }

export interface UpdateThreadInput {
  organizationId: string
  threadId: string
  status?: ThreadStatus
  result?: unknown
  error?: string
  skipReason?: string
}

export interface EnsureThreadInput {
  threadId?: string
  organizationId: string
  environmentId: string
  channelId: string
  agentId: string
  agentReleaseId: string
  triggerId?: string
  triggerReleaseId?: string
  isDebug?: boolean
  agentConfigHash: string
  workflowId: string
  subject: string
  payload: Record<string, unknown>
  createdBy?: string
}

export interface AddMessageInput {
  organizationId: string
  threadId: string
  runId?: string
  type: MessageType
  content?: string
  toolCall?: ToolCallData
  toolResult?: ToolResultData
}

export interface LoadThreadMessagesInput {
  threadId: string
}

export interface LoadThreadMessagesResult {
  messages: ConversationMessage[]
}

export interface ValidateParamsInput {
  params: Record<string, unknown>
  schema: Record<string, unknown>
}

export type ValidateParamsResult = { valid: true } | { valid: false; errors: string[] }

export interface CreateOutputItemInput {
  organizationId: string
  threadId: string
  runId?: string
  toolCallId?: string
  kind: OutputKind
  name?: string
  payload: Record<string, unknown>
}

export interface CreateHumanRequestInput {
  organizationId: string
  threadId: string
  runId?: string
  toolCallId: string
  params: Record<string, unknown>
  timeoutMs: number
}

export interface CreateApprovalHumanRequestInput {
  organizationId: string
  threadId: string
  runId?: string
  toolCallId: string
  action: {
    name: string
    params: Record<string, unknown>
    rationale?: string
  }
  authority: ApprovalAuthority
  timeoutMs: number
  variant?: "info" | "warning" | "danger"
  allowModification?: boolean
}

export interface ResolveHumanRequestInput {
  organizationId: string
  requestId: string
  status: "responded" | "cancelled" | "skipped"
  respondedBy?: string
  data?: unknown
}

export interface UpdateHumanRequestStatusInput {
  organizationId: string
  requestId: string
  status: "pending" | "responded" | "timeout" | "cancelled" | "skipped"
}

export interface CreateRunInput {
  organizationId: string
  threadId: string
  parentRunId?: string
  depth?: number
  agentId: string
  agentReleaseId?: string
  input?: Record<string, unknown>
}

export interface UpdateRunInput {
  organizationId: string
  id: string
  status?: RunStatus
  output?: unknown
  error?: string
  completedAt?: Date
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
}

export interface CompleteRunInput {
  organizationId: string
  id: string
  output?: unknown
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
}

export interface FailRunInput {
  organizationId: string
  id: string
  error: string
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
}

export interface CancelRunInput {
  organizationId: string
  id: string
  reason?: string
  inputTokens?: number
  outputTokens?: number
}

export interface RejectRunInput {
  organizationId: string
  id: string
  reason: string
  inputTokens?: number
  outputTokens?: number
}

export interface RecordRunMeterInput {
  organizationId: string
}

export type Activities = {
  loadAgentConfig: (input: LoadAgentConfigInput) => Promise<LoadAgentConfigResult>
  applyPrompt: (input: ApplyPromptInput) => Promise<ApplyPromptResult>
  resolveLlmConfig: (input: ResolveLlmConfigInput) => Promise<ResolveLlmConfigResult>
  callLLM: (input: CallLLMInput) => Promise<CallLLMResult>
  evaluateToolRules: (input: EvaluateToolRulesInput) => Promise<EvaluateToolRulesResult>
  executeFunction: (input: ExecuteFunctionInput) => Promise<ExecuteFunctionResult>
  executeScript: (input: ExecuteScriptInput) => Promise<ExecuteScriptResult>
  ensureThread: (input: EnsureThreadInput) => Promise<{ threadId: string }>
  updateThread: (input: UpdateThreadInput) => Promise<void>
  addMessage: (input: AddMessageInput) => Promise<{ messageId: string }>
  loadThreadMessages: (input: LoadThreadMessagesInput) => Promise<LoadThreadMessagesResult>
  validateToolParams: (input: ValidateParamsInput) => Promise<ValidateParamsResult>
  createOutputItem: (input: CreateOutputItemInput) => Promise<{ outputItemId: string }>
  createHumanRequest: (input: CreateHumanRequestInput) => Promise<{ requestId: string; timeoutMs: number }>
  createApprovalHumanRequest: (input: CreateApprovalHumanRequestInput) => Promise<{ requestId: string }>
  resolveHumanRequest: (input: ResolveHumanRequestInput) => Promise<{ responseId: string } | null>
  updateHumanRequestStatus: (input: UpdateHumanRequestStatusInput) => Promise<void>
  createRun: (input: CreateRunInput) => Promise<{ runId: string; run: unknown }>
  updateRun: (input: UpdateRunInput) => Promise<void>
  completeRun: (input: CompleteRunInput) => Promise<void>
  failRun: (input: FailRunInput) => Promise<void>
  cancelRun: (input: CancelRunInput) => Promise<void>
  rejectRun: (input: RejectRunInput) => Promise<void>
  recordRunMeter: (input: RecordRunMeterInput) => Promise<void>
}
