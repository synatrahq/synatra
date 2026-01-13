import { z } from "zod"
import { and, eq, desc, getTableColumns } from "drizzle-orm"
import { principal } from "./principal"
import { saveAgentWorkingCopy } from "./agent"
import { withDb, withTx, first } from "./database"
import { createError } from "@synatra/util/error"
import {
  AgentCopilotThreadTable,
  AgentCopilotMessageTable,
  AgentCopilotProposalTable,
  AgentCopilotToolLogTable,
  AgentCopilotResourceRequestTable,
  AgentCopilotQuestionRequestTable,
  AgentCopilotTriggerRequestTable,
  CopilotMessageRole,
  type CopilotInFlightState,
  type CopilotResourceRequestSuggestion,
  type CopilotQuestionData,
  type CopilotQuestionAnswer,
  type CopilotTriggerConfig,
} from "./schema/agent-copilot.sql"
import type { AgentRuntimeConfig, CopilotToolCall } from "./types"
import { UserConfigurableResourceType } from "./types"

export const CreateAgentCopilotThreadSchema = z.object({
  agentId: z.string(),
  title: z.string().optional(),
})

export const GetAgentCopilotThreadSchema = z.object({
  agentId: z.string(),
  threadId: z.string(),
})

export const UpdateAgentCopilotThreadSchema = z.object({
  agentId: z.string(),
  threadId: z.string(),
  title: z.string().min(1),
})

export const RemoveAgentCopilotThreadSchema = z.object({
  agentId: z.string(),
  threadId: z.string(),
})

export const ApproveAgentCopilotProposalSchema = z.object({
  agentId: z.string(),
  proposalId: z.string(),
})

export const RejectAgentCopilotProposalSchema = z.object({
  agentId: z.string(),
  proposalId: z.string(),
})

export const ListAgentCopilotToolLogsSchema = z.object({
  agentId: z.string(),
  threadId: z.string(),
})

export const RecordAgentCopilotToolLogSchema = z.object({
  threadId: z.string(),
  messageId: z.string().nullable().optional(),
  toolName: z.string(),
  toolCallId: z.string().nullable().optional(),
  status: z.enum(["started", "succeeded", "failed"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  error: z.string().nullable().optional(),
})

export const UpdateAgentCopilotToolLogSchema = z.object({
  logId: z.string(),
  threadId: z.string(),
  status: z.enum(["started", "succeeded", "failed"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  error: z.string().nullable().optional(),
  startedAt: z.date().nullable().optional(),
})

export const CreateAgentCopilotResourceRequestSchema = z.object({
  threadId: z.string(),
  messageId: z.string(),
  explanation: z.string(),
  suggestions: z.array(
    z.object({
      type: z.enum(UserConfigurableResourceType),
      reason: z.string(),
    }),
  ),
})

export const ListAgentCopilotResourceRequestsSchema = z.object({
  threadId: z.string(),
})

export const CompleteAgentCopilotResourceRequestSchema = z.object({
  agentId: z.string(),
  requestId: z.string(),
  resourceId: z.string(),
})

export const CancelAgentCopilotResourceRequestSchema = z.object({
  agentId: z.string(),
  requestId: z.string(),
})

export const CreateAgentCopilotQuestionRequestSchema = z.object({
  threadId: z.string(),
  messageId: z.string(),
  toolCallId: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      header: z.string(),
      options: z.array(z.object({ label: z.string(), description: z.string() })),
      multiSelect: z.boolean(),
    }),
  ),
})

export const AnswerAgentCopilotQuestionRequestSchema = z.object({
  requestId: z.string(),
  answers: z.array(
    z.object({
      questionIndex: z.number(),
      selected: z.array(z.string()),
      otherText: z.string().optional(),
    }),
  ),
})

export const CreateAgentCopilotTriggerRequestSchema = z.object({
  threadId: z.string(),
  messageId: z.string(),
  action: z.enum(["create", "update"]),
  triggerId: z.string().optional(),
  explanation: z.string(),
  config: z.object({
    name: z.string().optional(),
    type: z.enum(["webhook", "schedule", "app"]).optional(),
    cron: z.string().nullable().optional(),
    timezone: z.string().optional(),
    template: z.string().optional(),
    script: z.string().optional(),
    mode: z.enum(["prompt", "template", "script"]).optional(),
    appAccountId: z.string().nullable().optional(),
    appEvents: z.array(z.string()).nullable().optional(),
  }),
})

export const CompleteAgentCopilotTriggerRequestSchema = z.object({
  agentId: z.string(),
  requestId: z.string(),
})

export const CancelAgentCopilotTriggerRequestSchema = z.object({
  agentId: z.string(),
  requestId: z.string(),
})

export const AddAgentCopilotMessageToThreadSchema = z.object({
  agentId: z.string(),
  threadId: z.string().optional(),
  title: z.string().optional(),
  role: z.enum(CopilotMessageRole),
  content: z.string(),
})

export const FindAgentCopilotThreadWithAuthSchema = z.object({
  threadId: z.string(),
  agentId: z.string(),
})

export const UpdateAgentCopilotInFlightStateSchema = z.object({
  threadId: z.string(),
  state: z.unknown().nullable(),
  seq: z.number().optional(),
})

export const CreateAgentCopilotMessageSchema = z.object({
  threadId: z.string(),
  role: z.enum(CopilotMessageRole),
  content: z.string(),
  toolCalls: z.unknown().optional(),
})

export const GetAgentCopilotMessageHistorySchema = z.object({
  threadId: z.string(),
  limit: z.number().optional(),
})

export const CreateAgentCopilotProposalAndRejectPendingSchema = z.object({
  threadId: z.string(),
  messageId: z.string(),
  config: z.unknown(),
  explanation: z.string(),
})

export const GetPendingAgentCopilotQuestionRequestSchema = z.object({
  threadId: z.string(),
  toolCallId: z.string(),
})

export async function listAgentCopilotThreads(agentId: string) {
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select(getTableColumns(AgentCopilotThreadTable))
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.agentId, agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .orderBy(desc(AgentCopilotThreadTable.updatedAt))
      .limit(50),
  )
}

export async function createAgentCopilotThread(input: z.input<typeof CreateAgentCopilotThreadSchema>) {
  const data = CreateAgentCopilotThreadSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  const [thread] = await withDb((db) =>
    db
      .insert(AgentCopilotThreadTable)
      .values({
        organizationId,
        agentId: data.agentId,
        userId,
        title: data.title ?? "New Conversation",
      })
      .returning(),
  )
  return thread
}

export async function getAgentCopilotThread(input: z.input<typeof GetAgentCopilotThreadSchema>) {
  const data = GetAgentCopilotThreadSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb(async (db) => {
    const thread = await db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, data.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first)

    if (!thread) return null

    const messages = await db
      .select(getTableColumns(AgentCopilotMessageTable))
      .from(AgentCopilotMessageTable)
      .where(eq(AgentCopilotMessageTable.threadId, data.threadId))
      .orderBy(AgentCopilotMessageTable.createdAt)

    const proposals = await db
      .select()
      .from(AgentCopilotProposalTable)
      .where(eq(AgentCopilotProposalTable.threadId, data.threadId))
      .orderBy(desc(AgentCopilotProposalTable.createdAt))

    const resourceRequests = await db
      .select()
      .from(AgentCopilotResourceRequestTable)
      .where(eq(AgentCopilotResourceRequestTable.threadId, data.threadId))
      .orderBy(desc(AgentCopilotResourceRequestTable.createdAt))

    const questionRequests = await db
      .select()
      .from(AgentCopilotQuestionRequestTable)
      .where(eq(AgentCopilotQuestionRequestTable.threadId, data.threadId))
      .orderBy(desc(AgentCopilotQuestionRequestTable.createdAt))

    const triggerRequests = await db
      .select()
      .from(AgentCopilotTriggerRequestTable)
      .where(eq(AgentCopilotTriggerRequestTable.threadId, data.threadId))
      .orderBy(desc(AgentCopilotTriggerRequestTable.createdAt))

    return { thread, messages, proposals, resourceRequests, questionRequests, triggerRequests }
  })
}

export async function updateAgentCopilotThread(input: z.input<typeof UpdateAgentCopilotThreadSchema>) {
  const data = UpdateAgentCopilotThreadSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  const [thread] = await withDb((db) =>
    db
      .update(AgentCopilotThreadTable)
      .set({ title: data.title, updatedAt: new Date() })
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, data.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .returning(),
  )
  return thread
}

export async function removeAgentCopilotThread(input: z.input<typeof RemoveAgentCopilotThreadSchema>) {
  const data = RemoveAgentCopilotThreadSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  await withDb((db) =>
    db
      .delete(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, data.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      ),
  )
  return { success: true }
}

export async function approveAgentCopilotProposal(input: z.input<typeof ApproveAgentCopilotProposalSchema>) {
  const data = ApproveAgentCopilotProposalSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb(async (db) => {
    const proposal = await db
      .select()
      .from(AgentCopilotProposalTable)
      .where(eq(AgentCopilotProposalTable.id, data.proposalId))
      .then(first)

    if (!proposal) return null

    const thread = await db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, proposal.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first)

    if (!thread) return null

    const [updated] = await db
      .update(AgentCopilotProposalTable)
      .set({ status: "approved", decidedAt: new Date() })
      .where(and(eq(AgentCopilotProposalTable.id, data.proposalId), eq(AgentCopilotProposalTable.status, "pending")))
      .returning()

    if (!updated) {
      return { proposal, alreadyDecided: true, thread, seq: thread.seq ?? 0 }
    }

    await saveAgentWorkingCopy({
      agentId: data.agentId,
      runtimeConfig: proposal.config as AgentRuntimeConfig,
    })

    const seq = (thread.seq ?? 0) + 1
    await db
      .update(AgentCopilotThreadTable)
      .set({ seq, updatedAt: new Date() })
      .where(eq(AgentCopilotThreadTable.id, thread.id))

    return { proposal: updated, alreadyDecided: false, thread, seq }
  })
}

export async function rejectAgentCopilotProposal(input: z.input<typeof RejectAgentCopilotProposalSchema>) {
  const data = RejectAgentCopilotProposalSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb(async (db) => {
    const proposal = await db
      .select()
      .from(AgentCopilotProposalTable)
      .where(eq(AgentCopilotProposalTable.id, data.proposalId))
      .then(first)

    if (!proposal) return null

    const thread = await db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, proposal.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first)

    if (!thread) return null

    const [updated] = await db
      .update(AgentCopilotProposalTable)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(and(eq(AgentCopilotProposalTable.id, data.proposalId), eq(AgentCopilotProposalTable.status, "pending")))
      .returning()

    if (!updated) {
      return { proposal, alreadyDecided: true, thread, seq: thread.seq ?? 0 }
    }

    const seq = (thread.seq ?? 0) + 1
    await db
      .update(AgentCopilotThreadTable)
      .set({ seq, updatedAt: new Date() })
      .where(eq(AgentCopilotThreadTable.id, thread.id))

    return { proposal: updated, alreadyDecided: false, thread, seq }
  })
}

export async function listAgentCopilotToolLogs(input: z.input<typeof ListAgentCopilotToolLogsSchema>) {
  const data = ListAgentCopilotToolLogsSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  const thread = await withDb((db) =>
    db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, data.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first),
  )

  if (!thread) return null

  return withDb((db) =>
    db
      .select(getTableColumns(AgentCopilotToolLogTable))
      .from(AgentCopilotToolLogTable)
      .where(eq(AgentCopilotToolLogTable.threadId, data.threadId))
      .orderBy(desc(AgentCopilotToolLogTable.createdAt)),
  )
}

export async function recordAgentCopilotToolLog(input: z.input<typeof RecordAgentCopilotToolLogSchema>) {
  const data = RecordAgentCopilotToolLogSchema.parse(input)
  const [log] = await withDb((db) =>
    db
      .insert(AgentCopilotToolLogTable)
      .values({
        threadId: data.threadId,
        messageId: data.messageId ?? null,
        toolName: data.toolName,
        toolCallId: data.toolCallId ?? null,
        status: data.status,
        error: data.error ?? null,
        payload: data.payload ?? null,
      })
      .returning(),
  )
  return log
}

export async function updateAgentCopilotToolLog(input: z.input<typeof UpdateAgentCopilotToolLogSchema>) {
  const data = UpdateAgentCopilotToolLogSchema.parse(input)
  const now = new Date()
  const latencyMs = data.startedAt instanceof Date ? Math.max(0, now.getTime() - data.startedAt.getTime()) : null

  const updateData: Record<string, unknown> = {
    status: data.status,
    latencyMs,
  }
  if (data.payload !== undefined) updateData.payload = data.payload
  if (data.error !== undefined) updateData.error = data.error

  const [log] = await withDb((db) =>
    db
      .update(AgentCopilotToolLogTable)
      .set(updateData)
      .where(and(eq(AgentCopilotToolLogTable.id, data.logId), eq(AgentCopilotToolLogTable.threadId, data.threadId)))
      .returning(),
  )
  return log
}

export async function createAgentCopilotResourceRequest(
  input: z.input<typeof CreateAgentCopilotResourceRequestSchema>,
) {
  const data = CreateAgentCopilotResourceRequestSchema.parse(input)
  return withDb(async (db) => {
    await db
      .update(AgentCopilotResourceRequestTable)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(
        and(
          eq(AgentCopilotResourceRequestTable.threadId, data.threadId),
          eq(AgentCopilotResourceRequestTable.status, "pending"),
        ),
      )

    const [request] = await db
      .insert(AgentCopilotResourceRequestTable)
      .values({
        threadId: data.threadId,
        messageId: data.messageId,
        explanation: data.explanation,
        suggestions: data.suggestions as CopilotResourceRequestSuggestion[],
      })
      .returning()

    return request
  })
}

export async function listAgentCopilotResourceRequests(input: z.input<typeof ListAgentCopilotResourceRequestsSchema>) {
  const data = ListAgentCopilotResourceRequestsSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  const thread = await withDb((db) =>
    db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, data.threadId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first),
  )

  if (!thread) return null

  return withDb((db) =>
    db
      .select()
      .from(AgentCopilotResourceRequestTable)
      .where(eq(AgentCopilotResourceRequestTable.threadId, data.threadId))
      .orderBy(AgentCopilotResourceRequestTable.createdAt),
  )
}

export async function completeAgentCopilotResourceRequest(
  input: z.input<typeof CompleteAgentCopilotResourceRequestSchema>,
) {
  const data = CompleteAgentCopilotResourceRequestSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb(async (db) => {
    const request = await db
      .select()
      .from(AgentCopilotResourceRequestTable)
      .where(eq(AgentCopilotResourceRequestTable.id, data.requestId))
      .then(first)

    if (!request) return null

    const thread = await db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, request.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first)

    if (!thread) return null

    const [updated] = await db
      .update(AgentCopilotResourceRequestTable)
      .set({
        status: "completed",
        resourceId: data.resourceId,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(AgentCopilotResourceRequestTable.id, data.requestId),
          eq(AgentCopilotResourceRequestTable.status, "pending"),
        ),
      )
      .returning()

    if (!updated) {
      return { request, alreadyDecided: true, thread, seq: thread.seq ?? 0 }
    }

    const seq = (thread.seq ?? 0) + 1
    await db
      .update(AgentCopilotThreadTable)
      .set({ seq, updatedAt: new Date() })
      .where(eq(AgentCopilotThreadTable.id, thread.id))

    return { request: updated, alreadyDecided: false, thread, seq }
  })
}

export async function cancelAgentCopilotResourceRequest(
  input: z.input<typeof CancelAgentCopilotResourceRequestSchema>,
) {
  const data = CancelAgentCopilotResourceRequestSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb(async (db) => {
    const request = await db
      .select()
      .from(AgentCopilotResourceRequestTable)
      .where(eq(AgentCopilotResourceRequestTable.id, data.requestId))
      .then(first)

    if (!request) return null

    const thread = await db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, request.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first)

    if (!thread) return null

    const [updated] = await db
      .update(AgentCopilotResourceRequestTable)
      .set({
        status: "cancelled",
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(AgentCopilotResourceRequestTable.id, data.requestId),
          eq(AgentCopilotResourceRequestTable.status, "pending"),
        ),
      )
      .returning()

    if (!updated) {
      return { request, alreadyDecided: true, thread, seq: thread.seq ?? 0 }
    }

    const seq = (thread.seq ?? 0) + 1
    await db
      .update(AgentCopilotThreadTable)
      .set({ seq, updatedAt: new Date() })
      .where(eq(AgentCopilotThreadTable.id, thread.id))

    return { request: updated, alreadyDecided: false, thread, seq }
  })
}

export async function createAgentCopilotQuestionRequest(
  input: z.input<typeof CreateAgentCopilotQuestionRequestSchema>,
) {
  const data = CreateAgentCopilotQuestionRequestSchema.parse(input)
  return withDb(async (db) => {
    await db
      .update(AgentCopilotQuestionRequestTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(AgentCopilotQuestionRequestTable.threadId, data.threadId),
          eq(AgentCopilotQuestionRequestTable.status, "pending"),
        ),
      )

    const [request] = await db
      .insert(AgentCopilotQuestionRequestTable)
      .values({
        threadId: data.threadId,
        messageId: data.messageId,
        toolCallId: data.toolCallId,
        questions: data.questions as CopilotQuestionData[],
      })
      .returning()

    return request
  })
}

export async function answerAgentCopilotQuestionRequest(
  input: z.input<typeof AnswerAgentCopilotQuestionRequestSchema>,
) {
  const data = AnswerAgentCopilotQuestionRequestSchema.parse(input)
  const [request] = await withDb((db) =>
    db
      .update(AgentCopilotQuestionRequestTable)
      .set({
        status: "answered",
        answers: data.answers as CopilotQuestionAnswer[],
        answeredAt: new Date(),
      })
      .where(
        and(
          eq(AgentCopilotQuestionRequestTable.id, data.requestId),
          eq(AgentCopilotQuestionRequestTable.status, "pending"),
        ),
      )
      .returning(),
  )
  return request
}

export async function createAgentCopilotTriggerRequest(input: z.input<typeof CreateAgentCopilotTriggerRequestSchema>) {
  const data = CreateAgentCopilotTriggerRequestSchema.parse(input)
  return withDb(async (db) => {
    await db
      .update(AgentCopilotTriggerRequestTable)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(
        and(
          eq(AgentCopilotTriggerRequestTable.threadId, data.threadId),
          eq(AgentCopilotTriggerRequestTable.status, "pending"),
        ),
      )

    const [request] = await db
      .insert(AgentCopilotTriggerRequestTable)
      .values({
        threadId: data.threadId,
        messageId: data.messageId,
        action: data.action,
        triggerId: data.triggerId ?? null,
        explanation: data.explanation,
        config: data.config as CopilotTriggerConfig,
      })
      .returning()

    return request
  })
}

export async function completeAgentCopilotTriggerRequest(
  input: z.input<typeof CompleteAgentCopilotTriggerRequestSchema>,
) {
  const data = CompleteAgentCopilotTriggerRequestSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb(async (db) => {
    const request = await db
      .select()
      .from(AgentCopilotTriggerRequestTable)
      .where(eq(AgentCopilotTriggerRequestTable.id, data.requestId))
      .then(first)

    if (!request) return null

    const thread = await db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, request.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first)

    if (!thread) return null

    const [updated] = await db
      .update(AgentCopilotTriggerRequestTable)
      .set({ status: "completed", decidedAt: new Date() })
      .where(
        and(
          eq(AgentCopilotTriggerRequestTable.id, data.requestId),
          eq(AgentCopilotTriggerRequestTable.status, "pending"),
        ),
      )
      .returning()

    if (!updated) {
      return { request, alreadyDecided: true, thread, seq: thread.seq ?? 0 }
    }

    const seq = (thread.seq ?? 0) + 1
    await db
      .update(AgentCopilotThreadTable)
      .set({ seq, updatedAt: new Date() })
      .where(eq(AgentCopilotThreadTable.id, thread.id))

    return { request: updated, alreadyDecided: false, thread, seq }
  })
}

export async function cancelAgentCopilotTriggerRequest(input: z.input<typeof CancelAgentCopilotTriggerRequestSchema>) {
  const data = CancelAgentCopilotTriggerRequestSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb(async (db) => {
    const request = await db
      .select()
      .from(AgentCopilotTriggerRequestTable)
      .where(eq(AgentCopilotTriggerRequestTable.id, data.requestId))
      .then(first)

    if (!request) return null

    const thread = await db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, request.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then(first)

    if (!thread) return null

    const [updated] = await db
      .update(AgentCopilotTriggerRequestTable)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(
        and(
          eq(AgentCopilotTriggerRequestTable.id, data.requestId),
          eq(AgentCopilotTriggerRequestTable.status, "pending"),
        ),
      )
      .returning()

    if (!updated) {
      return { request, alreadyDecided: true, thread, seq: thread.seq ?? 0 }
    }

    const seq = (thread.seq ?? 0) + 1
    await db
      .update(AgentCopilotThreadTable)
      .set({ seq, updatedAt: new Date() })
      .where(eq(AgentCopilotThreadTable.id, thread.id))

    return { request: updated, alreadyDecided: false, thread, seq }
  })
}

export async function addAgentCopilotMessageToThread(input: z.input<typeof AddAgentCopilotMessageToThreadSchema>) {
  const data = AddAgentCopilotMessageToThreadSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()

  return withTx(async (tx) => {
    let threadId = data.threadId

    if (!threadId) {
      const [thread] = await tx
        .insert(AgentCopilotThreadTable)
        .values({
          organizationId,
          agentId: data.agentId,
          userId,
          title: data.title ?? "New conversation",
        })
        .returning()
      threadId = thread.id
    } else {
      const thread = await tx
        .select()
        .from(AgentCopilotThreadTable)
        .where(
          and(
            eq(AgentCopilotThreadTable.organizationId, organizationId),
            eq(AgentCopilotThreadTable.id, threadId),
            eq(AgentCopilotThreadTable.agentId, data.agentId),
            eq(AgentCopilotThreadTable.userId, userId),
          ),
        )
        .then(first)

      if (!thread) {
        throw createError("NotFoundError", { type: "CopilotThread", id: threadId })
      }
    }

    const [message] = await tx
      .insert(AgentCopilotMessageTable)
      .values({
        threadId,
        role: data.role,
        content: data.content,
      })
      .returning()

    await tx
      .update(AgentCopilotThreadTable)
      .set({ updatedAt: new Date() })
      .where(eq(AgentCopilotThreadTable.id, threadId))

    return { threadId, messageId: message.id }
  })
}

export async function findAgentCopilotThreadWithAuth(input: z.input<typeof FindAgentCopilotThreadWithAuthSchema>) {
  const data = FindAgentCopilotThreadWithAuthSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(AgentCopilotThreadTable)
      .where(
        and(
          eq(AgentCopilotThreadTable.organizationId, organizationId),
          eq(AgentCopilotThreadTable.id, data.threadId),
          eq(AgentCopilotThreadTable.agentId, data.agentId),
          eq(AgentCopilotThreadTable.userId, userId),
        ),
      )
      .then((rows) => rows[0] ?? null),
  )
}

export async function updateAgentCopilotInFlightState(input: z.input<typeof UpdateAgentCopilotInFlightStateSchema>) {
  const data = UpdateAgentCopilotInFlightStateSchema.parse(input)
  const organizationId = principal.orgId()
  const updates: Record<string, unknown> = {
    inFlightState: data.state as CopilotInFlightState,
    updatedAt: new Date(),
  }
  if (data.seq !== undefined) updates.seq = data.seq

  await withDb((db) =>
    db
      .update(AgentCopilotThreadTable)
      .set(updates)
      .where(
        and(eq(AgentCopilotThreadTable.organizationId, organizationId), eq(AgentCopilotThreadTable.id, data.threadId)),
      ),
  )
}

export async function createAgentCopilotMessage(input: z.input<typeof CreateAgentCopilotMessageSchema>) {
  const data = CreateAgentCopilotMessageSchema.parse(input)
  const [message] = await withDb((db) =>
    db
      .insert(AgentCopilotMessageTable)
      .values({
        threadId: data.threadId,
        role: data.role,
        content: data.content,
        toolCalls: (data.toolCalls as CopilotToolCall[]) ?? null,
      })
      .returning(),
  )
  return message
}

export async function getAgentCopilotMessageHistory(input: z.input<typeof GetAgentCopilotMessageHistorySchema>) {
  const data = GetAgentCopilotMessageHistorySchema.parse(input)
  const organizationId = principal.orgId()
  const thread = await withDb((db) =>
    db
      .select({ id: AgentCopilotThreadTable.id })
      .from(AgentCopilotThreadTable)
      .where(
        and(eq(AgentCopilotThreadTable.organizationId, organizationId), eq(AgentCopilotThreadTable.id, data.threadId)),
      )
      .then(first),
  )

  if (!thread) return []

  return withDb(async (db) => {
    let query = db
      .select()
      .from(AgentCopilotMessageTable)
      .where(eq(AgentCopilotMessageTable.threadId, data.threadId))
      .orderBy(desc(AgentCopilotMessageTable.createdAt))
    if (data.limit) query = query.limit(data.limit) as typeof query
    const rows = await query
    return rows.reverse()
  })
}

export async function createAgentCopilotProposalAndRejectPending(
  input: z.input<typeof CreateAgentCopilotProposalAndRejectPendingSchema>,
) {
  const data = CreateAgentCopilotProposalAndRejectPendingSchema.parse(input)
  return withTx(async (tx) => {
    await tx
      .update(AgentCopilotProposalTable)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(
        and(eq(AgentCopilotProposalTable.threadId, data.threadId), eq(AgentCopilotProposalTable.status, "pending")),
      )

    const [proposal] = await tx
      .insert(AgentCopilotProposalTable)
      .values({
        threadId: data.threadId,
        messageId: data.messageId,
        config: data.config as AgentRuntimeConfig,
        explanation: data.explanation,
      })
      .returning()

    return proposal
  })
}

export async function getPendingAgentCopilotQuestionRequest(
  input: z.input<typeof GetPendingAgentCopilotQuestionRequestSchema>,
) {
  const data = GetPendingAgentCopilotQuestionRequestSchema.parse(input)
  return withDb((db) =>
    db
      .select()
      .from(AgentCopilotQuestionRequestTable)
      .where(
        and(
          eq(AgentCopilotQuestionRequestTable.threadId, data.threadId),
          eq(AgentCopilotQuestionRequestTable.toolCallId, data.toolCallId),
          eq(AgentCopilotQuestionRequestTable.status, "pending"),
        ),
      )
      .then((rows) => rows[0] ?? null),
  )
}
