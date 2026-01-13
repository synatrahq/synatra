import { principal, updateThreadWithMessage, ensureThread as ensureThreadCore } from "@synatra/core"
import type { ThreadStatus, MessageType, ToolCallData, ToolResultData } from "@synatra/core/types"
import { streamingEnabled, emitThreadEvent } from "./thread-streaming"

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

export async function updateThread(input: UpdateThreadInput): Promise<void> {
  const { organizationId, threadId, status, result, error, skipReason } = input
  const hasChange = status !== undefined || result !== undefined || error !== undefined || skipReason !== undefined
  if (!hasChange) return

  return principal.withSystem({ organizationId }, async () => {
    const { seq, updatedAt, thread } = await updateThreadWithMessage({
      threadId,
      status,
      result,
      error,
      skipReason,
      incrementSeq: streamingEnabled,
    })

    if (streamingEnabled && updatedAt) {
      await emitThreadEvent({
        threadId,
        type: "thread.status_changed",
        seq,
        data: {
          status: thread.status,
          result: thread.result,
          error: thread.error,
          updatedAt: updatedAt.toISOString(),
        },
      })
    }
  })
}

export async function ensureThread(input: EnsureThreadInput): Promise<{ threadId: string }> {
  const {
    threadId,
    organizationId,
    environmentId,
    channelId,
    agentId,
    agentReleaseId,
    triggerId,
    triggerReleaseId,
    isDebug,
    agentConfigHash,
    workflowId,
    subject,
    payload,
    createdBy,
  } = input

  return principal.withSystem({ organizationId }, async () => {
    const result = await ensureThreadCore({
      id: threadId,
      organizationId,
      environmentId,
      channelId,
      agentId,
      agentReleaseId,
      triggerId,
      triggerReleaseId,
      isDebug,
      agentConfigHash,
      workflowId,
      subject,
      payload,
      createdBy,
    })

    return { threadId: result.threadId }
  })
}

export async function addMessage(input: AddMessageInput): Promise<{ messageId: string }> {
  const { organizationId, threadId, runId, type, content, toolCall, toolResult } = input

  return principal.withSystem({ organizationId }, async () => {
    const { message, seq } = await updateThreadWithMessage({
      threadId,
      message: { runId, type, content, toolCall, toolResult },
    })

    if (streamingEnabled && message) {
      await emitThreadEvent({
        threadId,
        type: "message.created",
        seq,
        data: { message },
      })
    }

    return { messageId: message!.id }
  })
}
