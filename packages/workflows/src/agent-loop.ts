import { condition, upsertSearchAttributes, executeChild } from "@temporalio/workflow"
import {
  getSystemTools,
  isSystemTool,
  isOutputTool,
  isHumanTool,
  isDelegationTool,
  isComputeTool,
} from "@synatra/core/system-tools"
import {
  type ThreadKind,
  type ThreadStatus,
  type RunStatus,
  type AgentRuntimeConfig,
  type ToolCallRecord,
  type OutputKind,
  type MessageType,
  type ApprovalAuthority,
  type HumanRequestStatus,
  type LlmProvider,
  MAX_SUBAGENT_DEPTH,
} from "@synatra/core/types"
import type { ConversationMessage, ResolvedSubagent, ResolvedLlmConfig } from "./types"

export type { ConversationMessage, ResolvedSubagent }

export interface AgentLoopContext {
  id: string
  kind: ThreadKind
  agentConfig: AgentRuntimeConfig
  organizationId: string
  environmentId: string
  agentId: string
  agentReleaseId?: string
  depth?: number
  parentRunId?: string
  existingRunId?: string
  resolvedSubagents?: ResolvedSubagent[]
  disableThreadUpdates?: boolean
}

export interface AgentLoopState {
  status: ThreadStatus
  currentRunId: string | null
  pendingHumanRequestId: string | null
  pendingAction: ToolCallRecord | null
}

export interface AgentLoopResult {
  status: ThreadStatus
  result?: unknown
  error?: string
  tokenUsage?: { inputTokens: number; outputTokens: number }
}

export interface CallLLMResult {
  type: "text" | "tool_calls" | "error"
  content?: string
  toolCalls?: ToolCallRecord[]
  error?: string
  reason?: "timeout" | "abort"
  durationMs: number
  usage?: { inputTokens: number; outputTokens: number }
}

export interface EvaluateToolRulesResult {
  requiresReview: boolean
  approvalAuthority: ApprovalAuthority
  selfApproval: boolean
  approvalTimeoutMs: number
}

export interface ExecuteFunctionResult {
  ok: boolean
  result?: unknown
  error?: string
  durationMs: number
}

export interface ValidateParamsResult {
  valid: boolean
  errors?: string[]
}

export interface HumanResponseSignalPayload {
  requestId: string
  status: "responded" | "cancelled" | "skipped"
  respondedBy?: string
  data?: unknown
}

export interface UserMessageSignalPayload {
  message: string
  messageId: string
  userId?: string
}

export interface AgentLoopActivities {
  resolveLlmConfig(input: {
    organizationId: string
    environmentId: string
    provider: LlmProvider
  }): Promise<{ config: ResolvedLlmConfig | null }>

  callLLM(input: {
    agentConfig: AgentRuntimeConfig
    messages: ConversationMessage[]
    timeoutMs?: number
    depth?: number
    subagents?: ResolvedSubagent[]
    llmConfig?: ResolvedLlmConfig
  }): Promise<CallLLMResult>

  evaluateToolRules(input: { tool: unknown }): Promise<EvaluateToolRulesResult>

  executeFunction(input: {
    agentId: string
    agentReleaseId?: string
    toolName: string
    params: Record<string, unknown>
    organizationId: string
    environmentId: string
    maxTimeoutMs?: number
    runtimeConfig?: AgentRuntimeConfig
  }): Promise<ExecuteFunctionResult>

  validateToolParams(input: {
    params: Record<string, unknown>
    schema: Record<string, unknown>
  }): Promise<ValidateParamsResult>

  loadAgentConfig(input: {
    agentId: string
    agentReleaseId?: string
    agentVersionMode: "current" | "fixed"
    organizationId: string
  }): Promise<{
    agentId: string
    agentReleaseId: string
    agentConfig: AgentRuntimeConfig
    agentConfigHash: string
  }>

  executeCodePure(input: { organizationId: string; environmentId: string; code: string; timeout?: number }): Promise<{
    success: boolean
    result?: unknown
    error?: string
    logs: unknown[][]
    duration: number
  }>
}

export interface AgentLoopPersistence {
  updateThread(input: {
    organizationId: string
    threadId: string
    status?: ThreadStatus
    result?: unknown
    error?: string
    skipReason?: string
  }): Promise<unknown>

  addMessage(input: {
    organizationId: string
    threadId: string
    runId?: string
    type: MessageType
    content?: string
    toolCall?: ToolCallRecord
    toolResult?: { toolCallId: string; result: unknown; error?: string }
  }): Promise<{ messageId: string }>

  createRun(input: {
    organizationId: string
    threadId: string
    parentRunId?: string
    agentId: string
    agentReleaseId?: string
    depth: number
    input: Record<string, unknown>
  }): Promise<{ runId: string }>

  updateRun(input: { organizationId: string; id: string; status: RunStatus; error?: string }): Promise<unknown>

  completeRun(input: {
    organizationId: string
    id: string
    output: unknown
    inputTokens?: number
    outputTokens?: number
  }): Promise<unknown>

  failRun(input: {
    organizationId: string
    id: string
    error: string
    inputTokens?: number
    outputTokens?: number
  }): Promise<unknown>

  cancelRun(input: {
    organizationId: string
    id: string
    reason?: string
    inputTokens?: number
    outputTokens?: number
  }): Promise<unknown>

  rejectRun(input: {
    organizationId: string
    id: string
    reason: string
    inputTokens?: number
    outputTokens?: number
  }): Promise<unknown>

  createHumanRequest(input: {
    organizationId: string
    threadId: string
    runId?: string
    toolCallId: string
    params: Record<string, unknown>
    timeoutMs: number
  }): Promise<{ requestId: string }>

  createApprovalHumanRequest(input: {
    organizationId: string
    threadId: string
    runId?: string
    toolCallId: string
    action: { name: string; params: Record<string, unknown>; rationale?: string }
    authority: ApprovalAuthority
    timeoutMs: number
    variant?: "info" | "warning" | "danger"
    allowModification?: boolean
  }): Promise<{ requestId: string }>

  resolveHumanRequest(input: {
    organizationId: string
    requestId: string
    status: "responded" | "cancelled" | "skipped"
    respondedBy?: string
    data?: unknown
  }): Promise<unknown>

  updateHumanRequestStatus(input: {
    organizationId: string
    requestId: string
    status: HumanRequestStatus
  }): Promise<unknown>

  createOutputItem(input: {
    organizationId: string
    threadId: string
    runId?: string
    toolCallId?: string
    kind: OutputKind
    name?: string
    payload: Record<string, unknown>
  }): Promise<unknown>
}

export interface AgentLoopSignals {
  isCancelled(): boolean
  isHumanResponseReceived(): boolean
  getHumanResponsePayload(): HumanResponseSignalPayload | undefined
  isUserMessageReceived(): boolean
  getUserMessagePayload(): UserMessageSignalPayload | undefined
  resetHumanResponse(): void
  resetUserMessage(): void
  setStatus(status: ThreadStatus): void
  setPendingAction(action: ToolCallRecord | null): void
  setPendingHumanRequestId(requestId: string | null): void
}

export interface AgentLoopInput {
  messages: ConversationMessage[]
  scriptDurationMs?: number
  payload?: Record<string, unknown>
  onRunCreated?: (runId: string) => void
}

function normalizeMaxIterations(raw: unknown): number {
  if (typeof raw === "number" && raw >= 1 && raw <= 100) {
    return Math.floor(raw)
  }
  return 10
}

function normalizeMaxToolCalls(raw: unknown): number {
  if (typeof raw === "number" && raw >= 1 && raw <= 50) {
    return Math.floor(raw)
  }
  return 10
}

function normalizeMaxActiveTime(raw: unknown): number {
  if (typeof raw === "number" && raw >= 30000 && raw <= 3600000) {
    return raw
  }
  return 600000
}

type TokenUsage = { inputTokens: number; outputTokens: number }

function getTokenUsage(inputTokens: number, outputTokens: number): TokenUsage | undefined {
  if (inputTokens > 0 || outputTokens > 0) {
    return { inputTokens, outputTokens }
  }
  return undefined
}

interface UpdateStatusParams {
  status: ThreadStatus
  state: AgentLoopState
  signals: AgentLoopSignals
  persistence: AgentLoopPersistence
  context: AgentLoopContext
  statusAttr: string
  runId?: string | null
  error?: string
  result?: unknown
  skipReason?: string
  tokenUsage?: TokenUsage
}

async function updateStatus(params: UpdateStatusParams): Promise<void> {
  const { status, state, signals, persistence, context, statusAttr, runId, error, result, skipReason, tokenUsage } =
    params
  const { organizationId, id: threadId, disableThreadUpdates } = context

  state.status = status
  signals.setStatus(status)

  if (!disableThreadUpdates) {
    upsertSearchAttributes({ [statusAttr]: [status] })
  }

  if (runId) {
    if (status === "failed" && error) {
      await persistence.failRun({
        organizationId,
        id: runId,
        error,
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
      })
    } else if (status === "completed" && result !== undefined) {
      await persistence.completeRun({
        organizationId,
        id: runId,
        output: result,
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
      })
    } else if (status === "cancelled") {
      await persistence.cancelRun({
        organizationId,
        id: runId,
        reason: error,
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
      })
    } else if (status === "rejected") {
      await persistence.rejectRun({
        organizationId,
        id: runId,
        reason: error || "Rejected",
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
      })
    } else {
      await persistence.updateRun({ organizationId, id: runId, status: status as RunStatus, error })
    }
  }

  if (!disableThreadUpdates) {
    await persistence.updateThread({ organizationId, threadId, status, error, result, skipReason })
  }
}

export async function executeAgentLoop(
  context: AgentLoopContext,
  persistence: AgentLoopPersistence,
  activities: AgentLoopActivities,
  signals: AgentLoopSignals,
  input: AgentLoopInput,
): Promise<{ result: AgentLoopResult; state: AgentLoopState }> {
  const state: AgentLoopState = {
    status: "running",
    currentRunId: null,
    pendingHumanRequestId: null,
    pendingAction: null,
  }

  const messages = [...input.messages]
  const { agentConfig, agentId, agentReleaseId, organizationId, environmentId, kind, id: threadId } = context
  const depth = context.depth ?? 0
  const statusAttr = kind === "playground" ? "PlaygroundStatus" : "ThreadStatus"

  let totalInputTokens = 0
  let totalOutputTokens = 0

  let runId: string
  if (context.existingRunId) {
    runId = context.existingRunId
  } else {
    const createdRun = await persistence.createRun({
      organizationId,
      threadId,
      parentRunId: context.parentRunId,
      agentId,
      agentReleaseId,
      depth,
      input: input.payload ?? {},
    })
    runId = createdRun.runId
    input.onRunCreated?.(runId)
  }
  state.currentRunId = runId

  const maxIterations = normalizeMaxIterations(agentConfig.maxIterations)
  const maxToolCallsPerIteration = normalizeMaxToolCalls(agentConfig.maxToolCallsPerIteration)
  const maxActiveTimeMs = normalizeMaxActiveTime(agentConfig.maxActiveTimeMs)

  let activeTimeMs = input.scriptDurationMs ?? 0
  const llmActivityTimeoutMs = 5 * 60 * 1000

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (signals.isCancelled()) {
      const tokenUsage = getTokenUsage(totalInputTokens, totalOutputTokens)
      await updateStatus({
        status: "cancelled",
        state,
        signals,
        persistence,
        context,
        statusAttr,
        runId: state.currentRunId,
        tokenUsage,
      })
      return { result: { status: "cancelled", tokenUsage }, state }
    }

    const remainingMs = maxActiveTimeMs - activeTimeMs
    if (remainingMs <= 0) {
      const tokenUsage = getTokenUsage(totalInputTokens, totalOutputTokens)
      await updateStatus({
        status: "failed",
        state,
        signals,
        persistence,
        context,
        statusAttr,
        runId: state.currentRunId,
        error: "Active time limit exceeded",
        tokenUsage,
      })
      return { result: { status: "failed", error: "Active time limit exceeded", tokenUsage }, state }
    }

    const llmTimeoutMs = Math.min(remainingMs, llmActivityTimeoutMs)

    const { config: llmConfig } = await activities.resolveLlmConfig({
      organizationId,
      environmentId,
      provider: agentConfig.model.provider,
    })

    if (!llmConfig) {
      const error = `${agentConfig.model.provider} is not available. Configure it in Resources > Synatra AI.`
      const tokenUsage = getTokenUsage(totalInputTokens, totalOutputTokens)
      await updateStatus({
        status: "failed",
        state,
        signals,
        persistence,
        context,
        statusAttr,
        runId: state.currentRunId,
        error,
        tokenUsage,
      })
      return { result: { status: "failed", error, tokenUsage }, state }
    }

    const llmResult = await activities.callLLM({
      agentConfig,
      messages,
      timeoutMs: llmTimeoutMs,
      depth,
      subagents: context.resolvedSubagents,
      llmConfig,
    })
    activeTimeMs += llmResult.durationMs

    if (llmResult.usage) {
      totalInputTokens += llmResult.usage.inputTokens
      totalOutputTokens += llmResult.usage.outputTokens
    }

    if (activeTimeMs >= maxActiveTimeMs) {
      const tokenUsage = getTokenUsage(totalInputTokens, totalOutputTokens)
      await updateStatus({
        status: "failed",
        state,
        signals,
        persistence,
        context,
        statusAttr,
        runId: state.currentRunId,
        error: "Active time limit exceeded",
        tokenUsage,
      })
      return { result: { status: "failed", error: "Active time limit exceeded", tokenUsage }, state }
    }

    if (llmResult.type === "error") {
      const tokenUsage = getTokenUsage(totalInputTokens, totalOutputTokens)
      await updateStatus({
        status: "failed",
        state,
        signals,
        persistence,
        context,
        statusAttr,
        runId: state.currentRunId,
        error: llmResult.error,
        tokenUsage,
      })
      return { result: { status: "failed", error: llmResult.error, tokenUsage }, state }
    }

    if (llmResult.type === "text" && llmResult.content !== undefined) {
      messages.push({ role: "assistant", content: llmResult.content })
      await persistence.addMessage({ organizationId, threadId, runId, type: "assistant", content: llmResult.content })
      const tokenUsage = getTokenUsage(totalInputTokens, totalOutputTokens)
      await updateStatus({
        status: "completed",
        state,
        signals,
        persistence,
        context,
        statusAttr,
        runId: state.currentRunId,
        result: llmResult.content,
        tokenUsage,
      })
      return { result: { status: "completed", result: llmResult.content, tokenUsage }, state }
    }

    if (llmResult.type === "tool_calls" && llmResult.toolCalls) {
      const toolCalls = llmResult.toolCalls

      messages.push({ role: "assistant", content: "", toolCalls })

      const systemCalls = toolCalls.filter((tc) => isSystemTool(tc.name))
      const normalCalls = toolCalls.filter((tc) => !isSystemTool(tc.name))

      if (systemCalls.length > 0) {
        const result = await handleSystemTools({
          context,
          state,
          persistence,
          activities,
          signals,
          messages,
          systemCalls,
          normalCalls,
          statusAttr,
          runId,
          tokenUsage: getTokenUsage(totalInputTokens, totalOutputTokens),
        })
        if (result) return result
        continue
      }

      const toolResult = await handleNormalTools({
        context,
        state,
        persistence,
        activities,
        signals,
        messages,
        toolCalls,
        maxToolCallsPerIteration,
        maxActiveTimeMs,
        activeTimeMs,
        statusAttr,
        runId,
        tokenUsage: getTokenUsage(totalInputTokens, totalOutputTokens),
      })
      if (toolResult.done) return toolResult.result!
      activeTimeMs = toolResult.activeTimeMs
    }
  }

  const tokenUsage = getTokenUsage(totalInputTokens, totalOutputTokens)
  await updateStatus({
    status: "failed",
    state,
    signals,
    persistence,
    context,
    statusAttr,
    runId: state.currentRunId,
    error: "Max iterations reached",
    tokenUsage,
  })
  return { result: { status: "failed", error: "Max iterations reached", tokenUsage }, state }
}

interface ValidateSystemToolCallParams {
  call: ToolCallRecord
  depth: number
  subagents: ResolvedSubagent[]
  activities: AgentLoopActivities
  persistence: AgentLoopPersistence
  messages: ConversationMessage[]
  organizationId: string
  threadId: string
  runId: string
}

type ValidateSystemToolCallResult = { valid: true } | { valid: false }

async function validateSystemToolCall(params: ValidateSystemToolCallParams): Promise<ValidateSystemToolCallResult> {
  const { call, depth, subagents, activities, persistence, messages, organizationId, threadId, runId } = params

  const systemTool = getSystemTools(depth, MAX_SUBAGENT_DEPTH, subagents).find((tool) => tool.name === call.name)
  if (!systemTool) {
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: call.id, result: null, error: `Tool not allowed: ${call.name}` },
    })
    messages.push({
      role: "tool",
      toolCallId: call.id,
      toolName: call.name,
      result: JSON.stringify({ error: `Tool not allowed: ${call.name}` }),
    })
    return { valid: false }
  }

  const validation = await activities.validateToolParams({
    params: call.params as Record<string, unknown>,
    schema: systemTool.params as Record<string, unknown>,
  })
  if (!validation.valid) {
    const errorMsg = `System tool parameters failed validation: ${validation.errors?.join(", ")}`
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: call.id, result: null, error: errorMsg },
    })
    messages.push({
      role: "tool",
      toolCallId: call.id,
      toolName: call.name,
      result: JSON.stringify({ error: errorMsg }),
    })
    return { valid: false }
  }

  return { valid: true }
}

interface HandleSystemToolsParams {
  context: AgentLoopContext
  state: AgentLoopState
  persistence: AgentLoopPersistence
  activities: AgentLoopActivities
  signals: AgentLoopSignals
  messages: ConversationMessage[]
  systemCalls: ToolCallRecord[]
  normalCalls: ToolCallRecord[]
  statusAttr: string
  runId: string
  tokenUsage: TokenUsage | undefined
}

async function handleSystemTools(
  params: HandleSystemToolsParams,
): Promise<{ result: AgentLoopResult; state: AgentLoopState } | null> {
  const {
    context,
    state,
    persistence,
    activities,
    signals,
    messages,
    systemCalls,
    normalCalls,
    statusAttr,
    runId,
    tokenUsage,
  } = params
  const threadId = context.id

  const humanCalls = systemCalls.filter((tc) => isHumanTool(tc.name))
  const outputCalls = systemCalls.filter((tc) => isOutputTool(tc.name))
  const completionCalls = systemCalls.filter((tc) => tc.name === "task_complete" || tc.name === "return_to_parent")
  const delegationCalls = systemCalls.filter((tc) => isDelegationTool(tc.name))
  const computeCalls = systemCalls.filter((tc) => isComputeTool(tc.name))
  const otherSystemCalls = systemCalls.filter(
    (tc) =>
      !isHumanTool(tc.name) &&
      !isOutputTool(tc.name) &&
      !isComputeTool(tc.name) &&
      tc.name !== "task_complete" &&
      tc.name !== "return_to_parent" &&
      !isDelegationTool(tc.name),
  )

  const invalidSystem =
    otherSystemCalls.length > 0 ||
    completionCalls.length > 1 ||
    humanCalls.length > 1 ||
    delegationCalls.length > 1 ||
    (humanCalls.length > 0 && (outputCalls.length > 0 || completionCalls.length > 0 || delegationCalls.length > 0)) ||
    (delegationCalls.length > 0 && (outputCalls.length > 0 || completionCalls.length > 0))

  const organizationId = context.organizationId

  if (invalidSystem) {
    const skipped = [...systemCalls, ...normalCalls]
    for (const call of skipped) {
      await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })
      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: null, error: "System tool usage is invalid for this response" },
      })
    }
    return null
  }

  if (delegationCalls.length === 1) {
    const result = await handleDelegationTool({
      context,
      state,
      persistence,
      activities,
      signals,
      messages,
      primary: delegationCalls[0],
      skipped: [...normalCalls, ...humanCalls, ...outputCalls, ...completionCalls, ...computeCalls],
      statusAttr,
      runId,
      tokenUsage,
    })
    return result
  }

  if (humanCalls.length === 1) {
    const result = await handleHumanTool({
      context,
      state,
      persistence,
      activities,
      signals,
      messages,
      primary: humanCalls[0],
      skipped: [...normalCalls, ...outputCalls, ...completionCalls, ...delegationCalls, ...computeCalls],
      statusAttr,
      runId,
      tokenUsage,
    })
    return result
  }

  if (normalCalls.length > 0) {
    for (const call of normalCalls) {
      await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })
      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: null, error: "System tools must be the only calls in a response" },
      })
    }
  }

  const depth = context.depth ?? 0
  const subagents = context.resolvedSubagents ?? []

  if (completionCalls.length > 0 && computeCalls.length > 0) {
    for (const call of computeCalls) {
      await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })
      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: null, error: "Completion tool must be the only call in a response" },
      })
    }
  }

  const orderedSystemCalls = [...outputCalls]
  if (completionCalls[0]) orderedSystemCalls.push(completionCalls[0])

  for (const call of orderedSystemCalls) {
    const validated = await validateSystemToolCall({
      call,
      depth,
      subagents,
      activities,
      persistence,
      messages,
      organizationId,
      threadId,
      runId,
    })
    if (!validated.valid) continue

    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })

    if (call.name === "task_complete") {
      const callParams = call.params as { summary: string }
      state.status = "completed"
      signals.setStatus("completed")
      if (!context.disableThreadUpdates) {
        upsertSearchAttributes({ [statusAttr]: ["completed"] })
      }

      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: { success: true, summary: callParams.summary } },
      })

      if (state.currentRunId) {
        await persistence.completeRun({
          organizationId,
          id: state.currentRunId,
          output: callParams.summary,
          inputTokens: tokenUsage?.inputTokens,
          outputTokens: tokenUsage?.outputTokens,
        })
      }
      if (!context.disableThreadUpdates) {
        await persistence.updateThread({ organizationId, threadId, status: "completed", result: callParams.summary })
      }

      return { result: { status: "completed", result: callParams.summary, tokenUsage }, state }
    }

    if (call.name === "return_to_parent") {
      const callParams = call.params as { result: unknown }
      state.status = "completed"
      signals.setStatus("completed")

      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: { success: true, result: callParams.result } },
      })

      if (state.currentRunId) {
        await persistence.completeRun({
          organizationId,
          id: state.currentRunId,
          output: callParams.result,
          inputTokens: tokenUsage?.inputTokens,
          outputTokens: tokenUsage?.outputTokens,
        })
      }

      return { result: { status: "completed", result: callParams.result, tokenUsage }, state }
    }

    if (isOutputTool(call.name)) {
      const callParams = call.params as Record<string, unknown>
      const kindMap: Record<string, OutputKind> = {
        output_table: "table",
        output_chart: "chart",
        output_markdown: "markdown",
        output_key_value: "key_value",
      }

      const kind = kindMap[call.name]
      const name = callParams.name as string | undefined
      const { name: _, ...payload } = callParams
      await persistence.createOutputItem({
        organizationId,
        threadId,
        runId,
        toolCallId: call.id,
        kind,
        name,
        payload,
      })

      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: { status: "displayed" } },
      })
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        result: JSON.stringify({ status: "displayed" }),
      })
    }
  }

  if (completionCalls.length === 0) {
    for (const call of computeCalls) {
      const validated = await validateSystemToolCall({
        call,
        depth,
        subagents,
        activities,
        persistence,
        messages,
        organizationId,
        threadId,
        runId,
      })
      if (!validated.valid) continue

      await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })

      if (call.name === "code_execute") {
        const callParams = call.params as { code: string; timeout?: number }

        const execResult = await activities.executeCodePure({
          organizationId,
          environmentId: context.environmentId,
          code: callParams.code,
          timeout: callParams.timeout,
        })

        if (execResult.success) {
          const result = { result: execResult.result, logs: execResult.logs, duration: execResult.duration }
          await persistence.addMessage({
            organizationId,
            threadId,
            runId,
            type: "tool_result",
            toolResult: { toolCallId: call.id, result },
          })
          messages.push({
            role: "tool",
            toolCallId: call.id,
            toolName: call.name,
            result: JSON.stringify(result),
          })
        } else {
          const errorResult = { logs: execResult.logs, duration: execResult.duration }
          await persistence.addMessage({
            organizationId,
            threadId,
            runId,
            type: "tool_result",
            toolResult: { toolCallId: call.id, result: errorResult, error: execResult.error },
          })
          messages.push({
            role: "tool",
            toolCallId: call.id,
            toolName: call.name,
            result: JSON.stringify({ error: execResult.error, ...errorResult }),
          })
        }
      }
    }
  }

  return null
}

interface HandleHumanToolParams {
  context: AgentLoopContext
  state: AgentLoopState
  persistence: AgentLoopPersistence
  activities: AgentLoopActivities
  signals: AgentLoopSignals
  messages: ConversationMessage[]
  primary: ToolCallRecord
  skipped: ToolCallRecord[]
  statusAttr: string
  runId: string
  tokenUsage: TokenUsage | undefined
}

async function handleHumanTool(
  params: HandleHumanToolParams,
): Promise<{ result: AgentLoopResult; state: AgentLoopState } | null> {
  const {
    context,
    state,
    persistence,
    activities,
    signals,
    messages,
    primary,
    skipped,
    statusAttr,
    runId,
    tokenUsage,
  } = params
  const threadId = context.id
  const organizationId = context.organizationId

  for (const call of skipped) {
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: call.id, result: null, error: "Human tool must be the only call in a response" },
    })
  }

  const depth = context.depth ?? 0
  const subagents = context.resolvedSubagents ?? []
  const systemTool = getSystemTools(depth, MAX_SUBAGENT_DEPTH, subagents).find((tool) => tool.name === primary.name)
  if (!systemTool) {
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: primary })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: null, error: `Tool not allowed: ${primary.name}` },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ error: `Tool not allowed: ${primary.name}` }),
    })
    return null
  }

  const validation = await activities.validateToolParams({
    params: primary.params as Record<string, unknown>,
    schema: systemTool.params as Record<string, unknown>,
  })
  if (!validation.valid) {
    const errorMsg = `System tool parameters failed validation: ${validation.errors?.join(", ")}`
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: primary })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: null, error: errorMsg },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ error: errorMsg }),
    })
    return null
  }

  await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: primary })

  const callParams = primary.params as Record<string, unknown>

  const agentTimeoutMs = context.agentConfig.humanRequestTimeoutMs ?? 259200000
  const requestedTimeoutMs = typeof callParams.timeoutMs === "number" ? callParams.timeoutMs : agentTimeoutMs
  const effectiveTimeoutMs = Math.min(requestedTimeoutMs, agentTimeoutMs)

  const { requestId } = await persistence.createHumanRequest({
    organizationId,
    threadId,
    runId,
    toolCallId: primary.id,
    params: callParams,
    timeoutMs: effectiveTimeoutMs,
  })

  state.status = "waiting_human"
  signals.setStatus("waiting_human")
  state.pendingHumanRequestId = requestId
  signals.setPendingHumanRequestId(requestId)
  if (!context.disableThreadUpdates) {
    upsertSearchAttributes({ [statusAttr]: ["waiting_human"] })
  }

  await persistence.updateRun({ organizationId, id: runId, status: "waiting_human" })
  if (!context.disableThreadUpdates) {
    await persistence.updateThread({ organizationId, threadId, status: "waiting_human" })
  }

  signals.resetHumanResponse()
  signals.resetUserMessage()

  const responded = await condition(
    () => signals.isHumanResponseReceived() || signals.isUserMessageReceived() || signals.isCancelled(),
    effectiveTimeoutMs,
  )

  if (!responded && !signals.isCancelled()) {
    await persistence.updateHumanRequestStatus({ organizationId, requestId, status: "timeout" })
    await updateStatus({
      status: "failed",
      state,
      signals,
      persistence,
      context,
      statusAttr,
      runId: state.currentRunId,
      error: "Human request timed out",
      tokenUsage,
    })
    state.pendingHumanRequestId = null
    signals.setPendingHumanRequestId(null)
    return { result: { status: "failed", error: "Human request timed out", tokenUsage }, state }
  }

  if (signals.isCancelled()) {
    await persistence.resolveHumanRequest({ organizationId, requestId, status: "cancelled" })
    await updateStatus({
      status: "cancelled",
      state,
      signals,
      persistence,
      context,
      statusAttr,
      runId: state.currentRunId,
      tokenUsage,
    })
    state.pendingHumanRequestId = null
    signals.setPendingHumanRequestId(null)
    return { result: { status: "cancelled", tokenUsage }, state }
  }

  if (signals.isUserMessageReceived()) {
    const payload = signals.getUserMessagePayload()!
    await persistence.resolveHumanRequest({ organizationId, requestId, status: "skipped" })

    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: { status: "skipped", reason: "user_message" } },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ status: "skipped", reason: "user_message" }),
    })

    messages.push({ role: "user", content: payload.message, messageId: payload.messageId })

    state.pendingHumanRequestId = null
    signals.setPendingHumanRequestId(null)
    state.status = "running"
    signals.setStatus("running")
    await persistence.updateRun({ organizationId, id: runId, status: "running" })
    if (!context.disableThreadUpdates) {
      await persistence.updateThread({ organizationId, threadId, status: "running" })
      upsertSearchAttributes({ [statusAttr]: ["running"] })
    }

    signals.resetUserMessage()
    return null
  }

  const response = signals.getHumanResponsePayload()!

  await persistence.resolveHumanRequest({
    organizationId,
    requestId,
    status: response.status,
    respondedBy: response.respondedBy,
    data: response.data,
  })

  state.pendingHumanRequestId = null
  signals.setPendingHumanRequestId(null)

  if (response.status === "cancelled") {
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: null, error: "Cancelled by user" },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ status: "cancelled" }),
    })
  }

  if (response.status === "skipped") {
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: { status: "skipped", data: response.data } },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ status: "skipped", data: response.data }),
    })
  }

  if (response.status === "responded") {
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: response.data },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ status: "responded", data: response.data }),
    })
  }

  state.status = "running"
  signals.setStatus("running")
  await persistence.updateRun({ organizationId, id: runId, status: "running" })
  if (!context.disableThreadUpdates) {
    await persistence.updateThread({ organizationId, threadId, status: "running" })
    upsertSearchAttributes({ [statusAttr]: ["running"] })
  }
  return null
}

interface CompletedSubagentResult {
  alias: string
  task: string
  result: unknown
}

function collectCompletedSubagentResults(messages: ConversationMessage[]): CompletedSubagentResult[] {
  const results: CompletedSubagentResult[] = []
  const toolCallMap = new Map<string, { alias: string; task: string }>()

  for (const msg of messages) {
    if (msg.role === "assistant" && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.name.startsWith("delegate_to_")) {
          const alias = tc.name.replace(/^delegate_to_/, "")
          const params = tc.params as { task: string }
          toolCallMap.set(tc.id, { alias, task: params.task })
        }
      }
    }
    if (msg.role === "tool" && msg.toolName.startsWith("delegate_to_")) {
      const info = toolCallMap.get(msg.toolCallId)
      if (info) {
        try {
          const parsed = JSON.parse(msg.result) as { status: string; result?: unknown }
          if (parsed.status === "completed" && parsed.result !== undefined) {
            results.push({ alias: info.alias, task: info.task, result: parsed.result })
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  return results
}

interface HandleDelegationToolParams {
  context: AgentLoopContext
  state: AgentLoopState
  persistence: AgentLoopPersistence
  activities: AgentLoopActivities
  signals: AgentLoopSignals
  messages: ConversationMessage[]
  primary: ToolCallRecord
  skipped: ToolCallRecord[]
  statusAttr: string
  runId: string
  tokenUsage: TokenUsage | undefined
}

async function handleDelegationTool(
  params: HandleDelegationToolParams,
): Promise<{ result: AgentLoopResult; state: AgentLoopState } | null> {
  const {
    context,
    state,
    persistence,
    activities,
    signals,
    messages,
    primary,
    skipped,
    statusAttr,
    runId,
    tokenUsage,
  } = params
  const threadId = context.id
  const organizationId = context.organizationId

  for (const call of skipped) {
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: call })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: call.id, result: null, error: "Delegation tool must be the only call in a response" },
    })
    messages.push({
      role: "tool",
      toolCallId: call.id,
      toolName: call.name,
      result: JSON.stringify({ error: "Delegation tool must be the only call in a response" }),
    })
  }

  const alias = primary.name.replace(/^delegate_to_/, "")
  const subagent = context.resolvedSubagents?.find((s) => s.alias === alias)

  if (!subagent) {
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: primary })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: null, error: `Subagent not found: ${alias}` },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ error: `Subagent not found: ${alias}` }),
    })
    return null
  }

  const depth = context.depth ?? 0
  const subagents = context.resolvedSubagents ?? []
  const systemTool = getSystemTools(depth, MAX_SUBAGENT_DEPTH, subagents).find((tool) => tool.name === primary.name)
  if (!systemTool) {
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: primary })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: null, error: `Tool not allowed: ${primary.name}` },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ error: `Tool not allowed: ${primary.name}` }),
    })
    return null
  }

  const validation = await activities.validateToolParams({
    params: primary.params as Record<string, unknown>,
    schema: systemTool.params as Record<string, unknown>,
  })
  if (!validation.valid) {
    const errorMsg = `Delegation tool parameters failed validation: ${validation.errors?.join(", ")}`
    await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: primary })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: primary.id, result: null, error: errorMsg },
    })
    messages.push({
      role: "tool",
      toolCallId: primary.id,
      toolName: primary.name,
      result: JSON.stringify({ error: errorMsg }),
    })
    return null
  }

  await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: primary })

  const callParams = primary.params as {
    task: string
    dependsOn?: Array<{ alias: string; summary?: string }>
  }
  const task = callParams.task

  const dependencies: Array<{ agentAlias: string; task: string; result: unknown }> = []
  if (callParams.dependsOn && callParams.dependsOn.length > 0) {
    const completedResults = collectCompletedSubagentResults(messages)
    for (const dep of callParams.dependsOn) {
      const found = completedResults.find((r) => r.alias === dep.alias)
      if (found) {
        dependencies.push({
          agentAlias: found.alias,
          task: found.task,
          result: dep.summary ? { summary: dep.summary, data: found.result } : found.result,
        })
      }
    }
  }

  await persistence.updateRun({ organizationId, id: runId, status: "waiting_subagent" })

  const subagentReleaseId = subagent.versionMode === "fixed" ? subagent.releaseId : undefined

  const subagentConfigResult = await activities.loadAgentConfig({
    agentId: subagent.agentId,
    agentReleaseId: subagentReleaseId,
    agentVersionMode: subagent.versionMode,
    organizationId,
  })

  const subagentRun = await persistence.createRun({
    organizationId,
    threadId,
    parentRunId: runId,
    agentId: subagent.agentId,
    agentReleaseId: subagentConfigResult.agentReleaseId,
    depth: (context.depth ?? 0) + 1,
    input: { task },
  })

  const siblings = (context.resolvedSubagents ?? [])
    .filter((s) => s.alias !== alias)
    .map((s) => ({ alias: s.alias, description: s.description }))

  const { subagentWorkflow } = await import("./subagent")
  const subagentResult = await executeChild(subagentWorkflow, {
    workflowId: `subagent-${subagentRun.runId}`,
    args: [
      {
        threadId,
        parentRunId: runId,
        runId: subagentRun.runId,
        organizationId,
        environmentId: context.environmentId,
        agentId: subagent.agentId,
        agentReleaseId: subagentConfigResult.agentReleaseId,
        agentConfig: subagentConfigResult.agentConfig,
        task,
        dependencies,
        siblings: siblings.length > 0 ? siblings : undefined,
      },
    ],
  })

  const resultData =
    subagentResult.status === "completed"
      ? { status: "completed", result: subagentResult.result }
      : subagentResult.status === "cancelled"
        ? { status: "cancelled" }
        : subagentResult.status === "rejected"
          ? { status: "rejected", reason: subagentResult.rejectReason }
          : { status: "failed", error: subagentResult.error }

  await persistence.addMessage({
    organizationId,
    threadId,
    runId,
    type: "tool_result",
    toolResult: { toolCallId: primary.id, result: resultData },
  })
  messages.push({
    role: "tool",
    toolCallId: primary.id,
    toolName: primary.name,
    result: JSON.stringify(resultData),
  })

  state.status = "running"
  signals.setStatus("running")
  await persistence.updateRun({ organizationId, id: runId, status: "running" })
  if (!context.disableThreadUpdates) {
    upsertSearchAttributes({ [statusAttr]: ["running"] })
  }

  if (signals.isCancelled()) {
    signals.setStatus("cancelled")
    if (!context.disableThreadUpdates) {
      upsertSearchAttributes({ [statusAttr]: ["cancelled"] })
    }
    await persistence.cancelRun({
      organizationId,
      id: runId,
      reason: "Parent workflow cancelled",
      inputTokens: tokenUsage?.inputTokens,
      outputTokens: tokenUsage?.outputTokens,
    })
    if (!context.disableThreadUpdates) {
      await persistence.updateThread({ organizationId, threadId, status: "cancelled" })
    }
    return { result: { status: "cancelled", tokenUsage }, state }
  }

  return null
}

interface HandleNormalToolsParams {
  context: AgentLoopContext
  state: AgentLoopState
  persistence: AgentLoopPersistence
  activities: AgentLoopActivities
  signals: AgentLoopSignals
  messages: ConversationMessage[]
  toolCalls: ToolCallRecord[]
  maxToolCallsPerIteration: number
  maxActiveTimeMs: number
  activeTimeMs: number
  statusAttr: string
  runId: string
  tokenUsage: TokenUsage | undefined
}

interface HandleNormalToolsResult {
  done: boolean
  result?: { result: AgentLoopResult; state: AgentLoopState }
  activeTimeMs: number
}

async function handleNormalTools(params: HandleNormalToolsParams): Promise<HandleNormalToolsResult> {
  const {
    context,
    state,
    persistence,
    activities,
    signals,
    messages,
    toolCalls,
    maxToolCallsPerIteration,
    maxActiveTimeMs,
    statusAttr,
    runId,
    tokenUsage,
  } = params
  let { activeTimeMs } = params
  const threadId = context.id
  const organizationId = context.organizationId

  const reviewCalls: Array<{ call: ToolCallRecord; actualParams: Record<string, unknown>; rationale?: string }> = []
  const executableCalls: Array<{ call: ToolCallRecord; params: Record<string, unknown> }> = []

  for (const toolCall of toolCalls) {
    if (isSystemTool(toolCall.name)) continue

    const toolConfig = context.agentConfig.tools.find((t) => t.name === toolCall.name)

    if (!toolConfig) {
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result: JSON.stringify({ error: `Tool not allowed: ${toolCall.name}` }),
      })
      await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall })
      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: toolCall.id, result: null, error: "Tool not allowed" },
      })
      continue
    }

    const { __rationale, ...actualParams } = toolCall.params as { __rationale?: string; [key: string]: unknown }
    const toolRules = await activities.evaluateToolRules({ tool: toolConfig })

    if (toolRules.requiresReview) {
      reviewCalls.push({ call: toolCall, actualParams, rationale: __rationale })
    } else {
      await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall })
      executableCalls.push({ call: toolCall, params: actualParams })
    }
  }

  if (reviewCalls.length > 0) {
    const result = await handleApprovalFlow({
      context,
      state,
      persistence,
      activities,
      signals,
      messages,
      reviewCalls,
      executableCalls,
      statusAttr,
      runId,
      tokenUsage,
    })
    if (result.done) return { done: true, result: result.result, activeTimeMs }
  }

  if (executableCalls.length > maxToolCallsPerIteration) {
    const excess = executableCalls.slice(maxToolCallsPerIteration)
    for (const { call } of excess) {
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        result: JSON.stringify({ error: "Too many tool calls in single response" }),
      })
      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: null, error: "Too many tool calls in single response" },
      })
    }
    executableCalls.splice(maxToolCallsPerIteration)
  }

  const execRemainingMs = maxActiveTimeMs - activeTimeMs
  if (execRemainingMs <= 0) {
    await updateStatus({
      status: "failed",
      state,
      signals,
      persistence,
      context,
      statusAttr,
      runId: state.currentRunId,
      error: "Active time limit exceeded",
      tokenUsage,
    })
    return {
      done: true,
      result: { result: { status: "failed", error: "Active time limit exceeded", tokenUsage }, state },
      activeTimeMs,
    }
  }

  const executionStart = Date.now()
  const results = await Promise.all(
    executableCalls.map(async ({ call, params }) => {
      const fnResult = await activities.executeFunction({
        agentId: context.agentId,
        agentReleaseId: context.agentReleaseId,
        toolName: call.name,
        params,
        organizationId: context.organizationId,
        environmentId: context.environmentId,
        maxTimeoutMs: execRemainingMs,
        runtimeConfig: context.agentReleaseId ? undefined : context.agentConfig,
      })
      return { call, params, fnResult }
    }),
  )

  const executionDuration = Date.now() - executionStart
  activeTimeMs += executionDuration

  for (const { call, fnResult } of results) {
    if (!fnResult.ok) {
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        result: JSON.stringify({ error: fnResult.error }),
      })
      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: null, error: fnResult.error },
      })
    } else {
      messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, result: JSON.stringify(fnResult.result) })
      await persistence.addMessage({
        organizationId,
        threadId,
        runId,
        type: "tool_result",
        toolResult: { toolCallId: call.id, result: fnResult.result },
      })
    }
  }

  if (activeTimeMs >= maxActiveTimeMs) {
    await updateStatus({
      status: "failed",
      state,
      signals,
      persistence,
      context,
      statusAttr,
      runId: state.currentRunId,
      error: "Active time limit exceeded",
      tokenUsage,
    })
    return {
      done: true,
      result: { result: { status: "failed", error: "Active time limit exceeded", tokenUsage }, state },
      activeTimeMs,
    }
  }

  if (!context.disableThreadUpdates) {
    await persistence.updateThread({ organizationId, threadId, status: "running" })
  }
  signals.setStatus("running")
  return { done: false, activeTimeMs }
}

interface HandleApprovalFlowParams {
  context: AgentLoopContext
  state: AgentLoopState
  persistence: AgentLoopPersistence
  activities: AgentLoopActivities
  signals: AgentLoopSignals
  messages: ConversationMessage[]
  reviewCalls: Array<{ call: ToolCallRecord; actualParams: Record<string, unknown>; rationale?: string }>
  executableCalls: Array<{ call: ToolCallRecord; params: Record<string, unknown> }>
  statusAttr: string
  runId: string
  tokenUsage: TokenUsage | undefined
}

interface HandleApprovalFlowResult {
  done: boolean
  result?: { result: AgentLoopResult; state: AgentLoopState }
}

async function handleApprovalFlow(params: HandleApprovalFlowParams): Promise<HandleApprovalFlowResult> {
  const {
    context,
    state,
    persistence,
    activities,
    signals,
    messages,
    reviewCalls,
    executableCalls,
    statusAttr,
    runId,
    tokenUsage,
  } = params
  const threadId = context.id
  const organizationId = context.organizationId

  const pending = reviewCalls[0]
  const toolConfig = context.agentConfig.tools.find((t) => t.name === pending.call.name)!
  const toolRules = await activities.evaluateToolRules({ tool: toolConfig })

  await persistence.addMessage({ organizationId, threadId, runId, type: "tool_call", toolCall: pending.call })

  const { requestId } = await persistence.createApprovalHumanRequest({
    organizationId,
    threadId,
    runId,
    toolCallId: pending.call.id,
    action: { name: pending.call.name, params: pending.actualParams, rationale: pending.rationale },
    authority: toolRules.approvalAuthority,
    timeoutMs: toolRules.approvalTimeoutMs,
    variant: "warning",
    allowModification: true,
  })

  state.status = "waiting_human"
  signals.setStatus("waiting_human")
  state.pendingAction = pending.call
  signals.setPendingAction(pending.call)
  if (!context.disableThreadUpdates) {
    upsertSearchAttributes({ [statusAttr]: ["waiting_human"] })
  }

  state.pendingHumanRequestId = requestId
  signals.setPendingHumanRequestId(requestId)
  if (!context.disableThreadUpdates) {
    upsertSearchAttributes({ [statusAttr]: ["waiting_human"] })
  }

  await persistence.updateRun({ organizationId, id: runId, status: "waiting_human" })
  if (!context.disableThreadUpdates) {
    await persistence.updateThread({ organizationId, threadId, status: "waiting_human" })
  }

  signals.resetHumanResponse()

  const timeoutMs = toolRules.approvalTimeoutMs
  const responded = await condition(() => signals.isHumanResponseReceived() || signals.isCancelled(), timeoutMs)

  if (!responded) {
    state.status = "failed"
    signals.setStatus("failed")
    if (!context.disableThreadUpdates) {
      upsertSearchAttributes({ [statusAttr]: ["failed"] })
    }
    await persistence.updateHumanRequestStatus({ organizationId, requestId, status: "timeout" })
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: pending.call.id, result: null, error: "Approval request timed out" },
    })
    if (state.currentRunId) {
      await persistence.failRun({
        organizationId,
        id: state.currentRunId,
        error: "Approval timeout",
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
      })
    }
    if (!context.disableThreadUpdates) {
      await persistence.updateThread({ organizationId, threadId, status: "failed", error: "Approval timeout" })
    }
    state.pendingHumanRequestId = null
    signals.setPendingHumanRequestId(null)
    state.pendingAction = null
    signals.setPendingAction(null)
    return { done: true, result: { result: { status: "failed", error: "Approval timeout", tokenUsage }, state } }
  }

  if (signals.isCancelled()) {
    signals.setStatus("cancelled")
    if (!context.disableThreadUpdates) {
      upsertSearchAttributes({ [statusAttr]: ["cancelled"] })
    }
    await persistence.resolveHumanRequest({ organizationId, requestId, status: "cancelled" })
    if (state.currentRunId) {
      await persistence.cancelRun({
        organizationId,
        id: state.currentRunId,
        reason: "Cancelled during approval",
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
      })
    }
    if (!context.disableThreadUpdates) {
      await persistence.updateThread({ organizationId, threadId, status: "cancelled" })
    }
    state.pendingHumanRequestId = null
    signals.setPendingHumanRequestId(null)
    state.pendingAction = null
    signals.setPendingAction(null)
    return { done: true, result: { result: { status: "cancelled", tokenUsage }, state } }
  }

  const response = signals.getHumanResponsePayload()!
  const responseData = response.data as
    | { approved?: boolean; modifiedParams?: Record<string, unknown>; comment?: string; reason?: string }
    | undefined

  if (
    response.status === "cancelled" ||
    response.status === "skipped" ||
    (responseData && responseData.approved === false)
  ) {
    state.status = "rejected"
    signals.setStatus("rejected")
    if (!context.disableThreadUpdates) {
      upsertSearchAttributes({ [statusAttr]: ["rejected"] })
    }
    await persistence.resolveHumanRequest({
      organizationId,
      requestId,
      status: response.status === "responded" ? "responded" : response.status,
      respondedBy: response.respondedBy,
      data: responseData,
    })
    const rejectReason = responseData?.comment || responseData?.reason || "Action rejected by user"
    await persistence.addMessage({
      organizationId,
      threadId,
      runId,
      type: "tool_result",
      toolResult: { toolCallId: pending.call.id, result: { approved: false, reason: rejectReason } },
    })
    if (state.currentRunId) {
      await persistence.rejectRun({
        organizationId,
        id: state.currentRunId,
        reason: rejectReason,
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
      })
    }
    if (!context.disableThreadUpdates) {
      await persistence.updateThread({ organizationId, threadId, status: "rejected", error: rejectReason })
    }
    state.pendingHumanRequestId = null
    signals.setPendingHumanRequestId(null)
    state.pendingAction = null
    signals.setPendingAction(null)
    return { done: true, result: { result: { status: "rejected", error: rejectReason, tokenUsage }, state } }
  }

  let processedParams = pending.actualParams
  const modifiedParams = responseData?.modifiedParams

  if (modifiedParams) {
    const toolCfg = context.agentConfig.tools.find((t) => t.name === pending.call.name)
    if (toolCfg?.params) {
      const validation = await activities.validateToolParams({ params: modifiedParams, schema: toolCfg.params })
      if (!validation.valid) {
        state.status = "failed"
        signals.setStatus("failed")
        if (!context.disableThreadUpdates) {
          upsertSearchAttributes({ [statusAttr]: ["failed"] })
        }
        const errorMsg = `Modified parameters failed validation: ${validation.errors?.join(", ")}`
        await persistence.resolveHumanRequest({
          organizationId,
          requestId,
          status: "responded",
          respondedBy: response.respondedBy,
          data: { approved: false, comment: errorMsg },
        })
        await persistence.addMessage({
          organizationId,
          threadId,
          runId,
          type: "tool_result",
          toolResult: { toolCallId: pending.call.id, result: null, error: errorMsg },
        })
        if (state.currentRunId) {
          await persistence.failRun({
            organizationId,
            id: state.currentRunId,
            error: errorMsg,
            inputTokens: tokenUsage?.inputTokens,
            outputTokens: tokenUsage?.outputTokens,
          })
        }
        if (!context.disableThreadUpdates) {
          await persistence.updateThread({ organizationId, threadId, status: "failed", error: errorMsg })
        }
        state.pendingHumanRequestId = null
        signals.setPendingHumanRequestId(null)
        state.pendingAction = null
        signals.setPendingAction(null)
        return { done: true, result: { result: { status: "failed", error: errorMsg, tokenUsage }, state } }
      }
    }
    processedParams = modifiedParams
  }

  await persistence.resolveHumanRequest({
    organizationId,
    requestId,
    status: "responded",
    respondedBy: response.respondedBy,
    data: { approved: true, modifiedParams, comment: responseData?.comment },
  })

  executableCalls.unshift({ call: pending.call, params: processedParams })

  state.status = "running"
  signals.setStatus("running")
  state.pendingAction = null
  signals.setPendingAction(null)
  state.pendingHumanRequestId = null
  signals.setPendingHumanRequestId(null)
  if (!context.disableThreadUpdates) {
    upsertSearchAttributes({ [statusAttr]: ["running"] })
  }

  await persistence.updateRun({ organizationId, id: runId, status: "running" })
  if (!context.disableThreadUpdates) {
    await persistence.updateThread({ organizationId, threadId, status: "running" })
  }

  return { done: false }
}
