import { z } from "zod"
import { eq, and, desc, lt, or, sql, count, inArray } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import { validatePayload } from "@synatra/util/validate"
import { ThreadTable } from "./schema/thread.sql"
import { MessageTable } from "./schema/message.sql"
import { RunTable } from "./schema/run.sql"
import { OutputItemTable } from "./schema/output-item.sql"
import { HumanRequestTable, HumanResponseTable } from "./schema/human-request.sql"
import { ChannelTable } from "./schema/channel.sql"
import { ChannelMemberTable } from "./schema/channel-member.sql"
import { MemberTable } from "./schema/member.sql"
import { TriggerTable } from "./schema/trigger.sql"
import { AgentTable, AgentReleaseTable } from "./schema/agent.sql"
import {
  ThreadStatus,
  MessageType,
  VersionMode,
  type ToolCallData,
  type ToolResultData,
  type ThreadWorkflowInput,
  type PromptConfigOverride,
  type PromptReference,
} from "./types"
import { getAgentById, findAgentByRelease } from "./agent"
import { getChannelById } from "./channel"
import { canAccessCurrentUserChannelMember } from "./channel-member"
import { isAssignedChannelAgent } from "./channel-agent"
import { getEnvironmentById } from "./environment"
import { createMessage } from "./message"
import { pendingHumanRequestByThread } from "./human-request"
import { getPromptById } from "./prompt"
import { createError } from "@synatra/util/error"

const allowedTransitions: Record<ThreadStatus, ThreadStatus[]> = {
  running: ["waiting_human", "completed", "failed", "cancelled", "rejected", "skipped"],
  waiting_human: ["running", "completed", "failed", "cancelled", "rejected"],
  completed: ["running"],
  failed: ["running"],
  cancelled: [],
  rejected: ["running"],
  skipped: [],
}

export function generateThreadWorkflowId(): string {
  return `workflow-${crypto.randomUUID()}`
}

async function getAccessibleChannelIds(): Promise<string[] | null> {
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const member = await withDb((db) =>
    db
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.userId, userId), eq(MemberTable.organizationId, organizationId)))
      .then(first),
  )

  if (!member) return []
  if (member.role === "owner" || member.role === "admin") return null

  const channelMembers = await withDb((db) =>
    db
      .select({ channelId: ChannelMemberTable.channelId })
      .from(ChannelMemberTable)
      .where(eq(ChannelMemberTable.memberId, member.id)),
  )

  return channelMembers.map((cm) => cm.channelId)
}

export const EnsureThreadSchema = z.object({
  id: z.string().optional(),
  organizationId: z.string(),
  environmentId: z.string(),
  channelId: z.string(),
  agentId: z.string(),
  agentReleaseId: z.string(),
  triggerId: z.string().optional(),
  triggerReleaseId: z.string().optional(),
  isDebug: z.boolean().optional(),
  agentConfigHash: z.string(),
  workflowId: z.string(),
  subject: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdBy: z.string().optional(),
})

export async function ensureThread(
  raw: z.input<typeof EnsureThreadSchema>,
): Promise<{ threadId: string; created: boolean }> {
  const input = EnsureThreadSchema.parse(raw)
  if (input.id) {
    const id = input.id
    const existing = await withDb((db) =>
      db.select({ id: ThreadTable.id }).from(ThreadTable).where(eq(ThreadTable.id, id)).then(first),
    )
    if (existing) return { threadId: id, created: false }
  }

  const [created] = await withDb((db) =>
    db
      .insert(ThreadTable)
      .values({
        organizationId: input.organizationId,
        environmentId: input.environmentId,
        channelId: input.channelId,
        agentId: input.agentId,
        agentReleaseId: input.agentReleaseId,
        triggerId: input.triggerId,
        triggerReleaseId: input.triggerReleaseId,
        isDebug: input.isDebug ?? false,
        agentConfigHash: input.agentConfigHash,
        workflowId: input.workflowId,
        subject: input.subject,
        payload: input.payload,
        status: "running",
        createdBy: input.createdBy,
      })
      .returning({ id: ThreadTable.id }),
  )

  return { threadId: created.id, created: true }
}

export const UpdateThreadSchema = z.object({
  id: z.string(),
  status: z.enum(ThreadStatus).optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  skipReason: z.string().optional(),
})

export async function updateThread(raw: z.input<typeof UpdateThreadSchema>) {
  const input = UpdateThreadSchema.parse(raw)
  const hasChange =
    input.status !== undefined ||
    input.result !== undefined ||
    input.error !== undefined ||
    input.skipReason !== undefined
  if (!hasChange) return null

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.status !== undefined) updateData.status = input.status
  if (input.result !== undefined) updateData.result = input.result
  if (input.error !== undefined) updateData.error = input.error
  if (input.skipReason !== undefined) updateData.skipReason = input.skipReason

  const [updated] = await withDb((db) =>
    db.update(ThreadTable).set(updateData).where(eq(ThreadTable.id, input.id)).returning(),
  )

  return updated ?? null
}

export const IncrementThreadSeqSchema = z.object({ id: z.string(), amount: z.number().optional() })

export async function incrementThreadSeq(raw: z.input<typeof IncrementThreadSeqSchema>) {
  const input = IncrementThreadSeqSchema.parse(raw)
  const amount = input.amount ?? 1
  const [updated] = await withDb((db) =>
    db
      .update(ThreadTable)
      .set({ seq: sql`${ThreadTable.seq} + ${amount}`, updatedAt: new Date() })
      .where(eq(ThreadTable.id, input.id))
      .returning({ seq: ThreadTable.seq, updatedAt: ThreadTable.updatedAt }),
  )
  if (!updated) return null
  return { seq: updated.seq, updatedAt: updated.updatedAt }
}

export async function touchThread(id: string) {
  const [updated] = await withDb((db) =>
    db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, id)).returning(),
  )
  return updated ?? null
}

export const ReactivateThreadSchema = z.object({ id: z.string() })

export async function reactivateThread(raw: z.input<typeof ReactivateThreadSchema>) {
  const input = ReactivateThreadSchema.parse(raw)
  const [updated] = await withDb((db) =>
    db
      .update(ThreadTable)
      .set({
        status: "running" as const,
        seq: sql`${ThreadTable.seq} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ThreadTable.id, input.id),
          or(
            eq(ThreadTable.status, "waiting_human"),
            eq(ThreadTable.status, "completed"),
            eq(ThreadTable.status, "rejected"),
            eq(ThreadTable.status, "failed"),
          ),
        ),
      )
      .returning(),
  )
  return updated ?? null
}

export const ListThreadsSchema = z
  .object({
    status: z.enum(ThreadStatus).optional(),
    agentId: z.string().optional(),
    triggerId: z.string().optional(),
    channelId: z.string().optional(),
    archived: z.boolean().optional(),
    cursor: z.string().optional(),
    limit: z.number().min(1).max(100).optional(),
  })
  .optional()

export async function listThreads(raw?: z.input<typeof ListThreadsSchema>) {
  const filters = ListThreadsSchema.parse(raw)
  const organizationId = principal.orgId()
  const limit = filters?.limit ?? 20

  const accessibleChannels = await getAccessibleChannelIds()
  if (accessibleChannels !== null && accessibleChannels.length === 0) {
    return { items: [], nextCursor: null }
  }

  const conditions = [eq(ThreadTable.organizationId, organizationId), eq(ThreadTable.kind, "thread")]

  if (accessibleChannels !== null) {
    conditions.push(inArray(ThreadTable.channelId, accessibleChannels))
  }

  if (filters?.archived !== undefined) {
    conditions.push(eq(ThreadTable.archived, filters.archived))
  }
  if (filters?.status) {
    conditions.push(eq(ThreadTable.status, filters.status))
  }
  if (filters?.agentId) {
    conditions.push(eq(ThreadTable.agentId, filters.agentId))
  }
  if (filters?.triggerId) {
    conditions.push(eq(ThreadTable.triggerId, filters.triggerId))
  }
  if (filters?.channelId) {
    conditions.push(eq(ThreadTable.channelId, filters.channelId))
  }
  if (filters?.cursor) {
    const [cursorDate, cursorId] = filters.cursor.split("_")
    conditions.push(
      or(
        lt(ThreadTable.updatedAt, new Date(cursorDate)),
        and(eq(ThreadTable.updatedAt, new Date(cursorDate)), lt(ThreadTable.id, cursorId)),
      )!,
    )
  }

  const threads = await withDb((db) =>
    db
      .select({
        id: ThreadTable.id,
        agentId: ThreadTable.agentId,
        triggerId: ThreadTable.triggerId,
        subject: ThreadTable.subject,
        status: ThreadTable.status,
        createdAt: ThreadTable.createdAt,
        updatedAt: ThreadTable.updatedAt,
        triggerSlug: TriggerTable.slug,
        agentName: AgentTable.name,
        agentIcon: AgentTable.icon,
        agentIconColor: AgentTable.iconColor,
        channelSlug: ChannelTable.slug,
      })
      .from(ThreadTable)
      .leftJoin(AgentTable, eq(ThreadTable.agentId, AgentTable.id))
      .leftJoin(TriggerTable, eq(ThreadTable.triggerId, TriggerTable.id))
      .innerJoin(ChannelTable, eq(ThreadTable.channelId, ChannelTable.id))
      .where(and(...conditions))
      .orderBy(desc(ThreadTable.updatedAt), desc(ThreadTable.id))
      .limit(limit + 1),
  )

  const hasMore = threads.length > limit
  const items = hasMore ? threads.slice(0, limit) : threads
  const nextCursor = hasMore ? `${items[items.length - 1].updatedAt}_${items[items.length - 1].id}` : null

  return { items, nextCursor }
}

export async function getThreadById(id: string) {
  const organizationId = principal.orgId()
  const thread = await withDb((db) =>
    db
      .select()
      .from(ThreadTable)
      .where(and(eq(ThreadTable.id, id), eq(ThreadTable.organizationId, organizationId)))
      .then(first),
  )
  if (!thread) throw createError("NotFoundError", { type: "Thread", id })

  const [messages, runsWithAgent, outputItems, humanRequests, humanResponses, agent, trigger] = await Promise.all([
    withDb((db) => db.select().from(MessageTable).where(eq(MessageTable.threadId, id)).orderBy(MessageTable.createdAt)),
    withDb((db) =>
      db
        .select({
          run: RunTable,
          agent: {
            id: AgentTable.id,
            name: AgentTable.name,
            icon: AgentTable.icon,
            iconColor: AgentTable.iconColor,
          },
        })
        .from(RunTable)
        .leftJoin(AgentTable, eq(RunTable.agentId, AgentTable.id))
        .where(eq(RunTable.threadId, id))
        .orderBy(RunTable.createdAt),
    ),
    withDb((db) =>
      db.select().from(OutputItemTable).where(eq(OutputItemTable.threadId, id)).orderBy(OutputItemTable.createdAt),
    ),
    withDb((db) =>
      db
        .select()
        .from(HumanRequestTable)
        .where(eq(HumanRequestTable.threadId, id))
        .orderBy(HumanRequestTable.createdAt),
    ),
    withDb((db) =>
      db
        .select()
        .from(HumanResponseTable)
        .innerJoin(HumanRequestTable, eq(HumanResponseTable.requestId, HumanRequestTable.id))
        .where(eq(HumanRequestTable.threadId, id)),
    ).then((rows) => rows.map((r) => r.human_response)),
    withDb((db) =>
      db
        .select({
          id: AgentTable.id,
          name: AgentTable.name,
          icon: AgentTable.icon,
          iconColor: AgentTable.iconColor,
          runtimeConfig: AgentReleaseTable.runtimeConfig,
        })
        .from(AgentTable)
        .leftJoin(AgentReleaseTable, eq(AgentTable.currentReleaseId, AgentReleaseTable.id))
        .where(eq(AgentTable.id, thread.agentId))
        .then(first),
    ),
    thread.triggerId
      ? withDb((db) =>
          db
            .select({ id: TriggerTable.id, slug: TriggerTable.slug })
            .from(TriggerTable)
            .where(eq(TriggerTable.id, thread.triggerId!))
            .then(first),
        )
      : Promise.resolve(null),
  ])

  const runs = runsWithAgent.map((r) => ({
    ...r.run,
    agent: r.agent,
  }))

  return {
    ...thread,
    agent: agent ?? null,
    trigger: trigger ?? null,
    messages,
    runs,
    outputItems,
    humanRequests,
    humanResponses,
  }
}

export const CreateThreadSchema = z.object({
  agentId: z.string(),
  agentReleaseId: z.string(),
  channelId: z.string(),
  triggerId: z.string().optional(),
  triggerReleaseId: z.string().optional(),
  isDebug: z.boolean().optional(),
  environmentId: z.string(),
  agentConfigHash: z.string(),
  workflowId: z.string(),
  subject: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdBy: z.string().optional(),
})

export async function createThread(raw: z.input<typeof CreateThreadSchema>) {
  const input = CreateThreadSchema.parse(raw)
  const organizationId = principal.orgId()

  const [thread] = await withDb((db) =>
    db
      .insert(ThreadTable)
      .values({
        organizationId,
        agentId: input.agentId,
        agentReleaseId: input.agentReleaseId,
        channelId: input.channelId,
        triggerId: input.triggerId,
        triggerReleaseId: input.triggerReleaseId,
        isDebug: input.isDebug ?? false,
        environmentId: input.environmentId,
        agentConfigHash: input.agentConfigHash,
        workflowId: input.workflowId,
        subject: input.subject,
        payload: input.payload,
        status: "running",
        createdBy: input.createdBy,
      })
      .returning(),
  )

  return thread
}

export const StartThreadSchema = z
  .object({
    agentId: z.string(),
    channelId: z.string(),
    environmentId: z.string(),
    subject: z.string(),
    message: z.string().optional(),
    promptId: z.string().optional(),
    promptInput: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => data.message || data.promptId, {
    message: "Either message or promptId must be provided",
  })

export async function startThread(raw: z.input<typeof StartThreadSchema>) {
  const input = StartThreadSchema.parse(raw)
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const agent = await getAgentById(input.agentId)
  if (!agent.currentReleaseId || !agent.configHash) {
    throw createError("BadRequestError", { message: "Agent has no published release" })
  }

  await getChannelById(input.channelId)
  const hasChannelAccess = await canAccessCurrentUserChannelMember(input.channelId)
  if (!hasChannelAccess) {
    throw createError("ForbiddenError", { message: "No access to this channel" })
  }

  const isAgentAssigned = await isAssignedChannelAgent({ channelId: input.channelId, agentId: input.agentId })
  if (!isAgentAssigned) {
    throw createError("ForbiddenError", { message: "Agent is not assigned to this channel" })
  }

  await getEnvironmentById(input.environmentId)

  let promptRef: PromptReference | undefined
  if (input.promptId) {
    const prompt = await getPromptById(input.promptId)
    if (!prompt.currentReleaseId) {
      throw createError("BadRequestError", { message: "Prompt has no published release" })
    }
    if (prompt.agentId !== input.agentId) {
      throw createError("BadRequestError", { message: "Prompt does not belong to the selected agent" })
    }
    if (prompt.inputSchema) {
      const validation = validatePayload(input.promptInput ?? {}, prompt.inputSchema)
      if (!validation.valid) {
        throw createError("BadRequestError", { message: `Invalid prompt input: ${validation.errors.join(", ")}` })
      }
    }
    promptRef = {
      promptId: prompt.id,
      promptReleaseId: prompt.currentReleaseId,
      mode: (prompt.mode as "template" | "script") ?? "template",
      template: prompt.content ?? undefined,
      script: prompt.script ?? undefined,
    }
  }

  const workflowId = generateThreadWorkflowId()
  const thread = await createThread({
    agentId: agent.id,
    agentReleaseId: agent.currentReleaseId,
    channelId: input.channelId,
    environmentId: input.environmentId,
    agentConfigHash: agent.configHash,
    workflowId,
    subject: input.subject,
    payload: input.promptInput ?? {},
    createdBy: userId,
  })

  let message: Awaited<ReturnType<typeof createMessage>> | undefined
  let messageSeq = thread.seq
  let messageUpdatedAt = thread.updatedAt

  if (input.message) {
    message = await createMessage({
      threadId: thread.id,
      type: "user",
      content: input.message,
    })
    const seqResult = await incrementThreadSeq({ id: thread.id })
    messageSeq = seqResult?.seq ?? thread.seq
    messageUpdatedAt = seqResult?.updatedAt ?? thread.updatedAt
  }

  const workflowInput: ThreadWorkflowInput = {
    threadId: thread.id,
    agentId: agent.id,
    agentReleaseId: agent.currentReleaseId,
    agentVersionMode: "fixed",
    organizationId,
    environmentId: input.environmentId,
    channelId: input.channelId,
    subject: input.subject,
    message: input.message,
    initialMessageSaved: !!input.message,
    messageId: message?.id,
    createdBy: userId,
    promptRef,
    promptInput: input.promptInput,
  }

  return { thread, message, messageSeq, messageUpdatedAt, workflowInput }
}

export const StartThreadFromTriggerSchema = z.object({
  triggerId: z.string(),
  triggerSlug: z.string(),
  triggerReleaseId: z.string().optional(),
  agentId: z.string(),
  agentVersionMode: z.enum(VersionMode),
  agentReleaseId: z.string().optional(),
  channelId: z.string(),
  environmentId: z.string(),
  payload: z.record(z.string(), z.unknown()),
  subject: z.string().optional(),
  isDebug: z.boolean().optional(),
  createdBy: z.string().optional(),
  promptConfigOverride: z
    .object({
      mode: z.enum(["template", "script"]),
      template: z.string().optional(),
      script: z.string().optional(),
    })
    .optional(),
})

export async function startThreadFromTrigger(raw: z.input<typeof StartThreadFromTriggerSchema>) {
  const input = StartThreadFromTriggerSchema.parse(raw)
  const organizationId = principal.orgId()

  const agent = await getAgentById(input.agentId)
  if (!agent.currentReleaseId || !agent.configHash) {
    throw createError("BadRequestError", { message: "Agent has no published release" })
  }

  const releaseId =
    input.agentVersionMode === "current" ? agent.currentReleaseId : (input.agentReleaseId ?? agent.currentReleaseId)

  const release = await findAgentByRelease({ agentId: agent.id, releaseId })
  if (!release) {
    throw createError("BadRequestError", { message: "Agent release not found" })
  }

  const subject =
    typeof input.payload.subject === "string" && input.payload.subject.trim()
      ? input.payload.subject
      : (input.subject ?? input.triggerSlug)

  const workflowId = generateThreadWorkflowId()

  const thread = await createThread({
    agentId: agent.id,
    agentReleaseId: releaseId,
    channelId: input.channelId,
    triggerId: input.triggerId,
    triggerReleaseId: input.triggerReleaseId,
    environmentId: input.environmentId,
    agentConfigHash: release.configHash,
    workflowId,
    subject,
    payload: input.payload,
    isDebug: input.isDebug,
    createdBy: input.createdBy,
  })

  const workflowInput: ThreadWorkflowInput = {
    threadId: thread.id,
    triggerId: input.triggerId,
    triggerReleaseId: input.triggerReleaseId,
    isDebug: input.isDebug,
    agentId: agent.id,
    agentReleaseId: releaseId,
    agentVersionMode: input.agentVersionMode,
    organizationId,
    environmentId: input.environmentId,
    channelId: input.channelId,
    subject,
    payload: input.payload,
    createdBy: input.createdBy,
    promptConfigOverride: input.promptConfigOverride as PromptConfigOverride | undefined,
  }

  return { thread, workflowInput }
}

export const ReplyThreadSchema = z.object({
  threadId: z.string(),
  message: z.string().min(1),
})

export async function replyThread(raw: z.input<typeof ReplyThreadSchema>) {
  const input = ReplyThreadSchema.parse(raw)
  const userId = principal.userId()
  const organizationId = principal.orgId()

  const thread = await getThreadById(input.threadId)

  if (thread.channelId) {
    const hasAccess = await canAccessCurrentUserChannelMember(thread.channelId)
    if (!hasAccess) {
      throw createError("ForbiddenError", { message: "No access to this channel" })
    }
  } else if (thread.createdBy !== userId) {
    throw createError("ForbiddenError", { message: "No access to this thread" })
  }

  if (thread.status === "running") {
    throw createError("ConflictError", { message: "Thread is currently processing" })
  }

  const replyableStatuses = ["completed", "rejected", "failed", "waiting_human"]
  if (!replyableStatuses.includes(thread.status)) {
    throw createError("BadRequestError", { message: `Cannot reply to thread with status: ${thread.status}` })
  }

  const message = await createMessage({
    threadId: input.threadId,
    type: "user",
    content: input.message,
  })

  const messageSeqResult = await incrementThreadSeq({ id: input.threadId })
  const messageSeq = messageSeqResult?.seq ?? thread.seq
  const messageUpdatedAt = messageSeqResult?.updatedAt ?? thread.updatedAt

  if (thread.status === "waiting_human") {
    const pending = await pendingHumanRequestByThread(input.threadId)
    if (!pending) {
      throw createError("BadRequestError", { message: "No pending human request found" })
    }
    if (pending.kind === "approval") {
      throw createError("BadRequestError", { message: "Cannot reply while approval is pending" })
    }

    return {
      thread,
      message,
      messageSeq,
      messageUpdatedAt,
      action: "signal" as const,
      signalPayload: {
        message: input.message,
        messageId: message.id,
        userId,
      },
    }
  }

  if (!thread.agentReleaseId) {
    throw createError("InternalError", { message: "Thread missing agent release" })
  }
  if (!thread.channelId) {
    throw createError("InternalError", { message: "Thread missing channel" })
  }

  const updated = await reactivateThread({ id: input.threadId })
  if (!updated) {
    throw createError("ConflictError", { message: "Thread was modified by another request" })
  }

  const workflowInput: ThreadWorkflowInput = {
    threadId: input.threadId,
    agentId: thread.agentId,
    agentReleaseId: thread.agentReleaseId,
    agentVersionMode: "fixed",
    organizationId,
    environmentId: thread.environmentId,
    channelId: thread.channelId,
    subject: thread.subject ?? "",
    message: input.message,
    initialMessageSaved: true,
    messageId: message.id,
    createdBy: userId,
  }

  return {
    thread: { ...thread, status: updated.status, seq: updated.seq },
    message,
    messageSeq,
    messageUpdatedAt,
    statusSeq: updated.seq,
    statusUpdatedAt: updated.updatedAt,
    action: "start" as const,
    workflowInput,
  }
}

export const UpdateThreadStatusSchema = z.object({
  id: z.string(),
  status: z.enum(ThreadStatus),
  result: z.unknown().optional(),
  error: z.string().optional(),
})

export async function updateThreadStatus(raw: z.input<typeof UpdateThreadStatusSchema>) {
  const input = UpdateThreadStatusSchema.parse(raw)
  const thread = await withDb((db) => db.select().from(ThreadTable).where(eq(ThreadTable.id, input.id)).then(first))

  if (!thread) {
    throw new Error("Thread not found")
  }

  if (input.status !== thread.status && !allowedTransitions[thread.status].includes(input.status)) {
    throw new Error(`Invalid status transition from ${thread.status} to ${input.status}`)
  }

  const updateData: Record<string, unknown> = {
    status: input.status,
    updatedAt: new Date(),
  }

  if (input.result !== undefined) updateData.result = input.result
  if (input.error !== undefined) updateData.error = input.error

  const [updated] = await withDb((db) =>
    db.update(ThreadTable).set(updateData).where(eq(ThreadTable.id, input.id)).returning(),
  )

  return updated
}

export const RemoveThreadSchema = z.object({ id: z.string() })

export async function removeThread(raw: z.input<typeof RemoveThreadSchema>) {
  const input = RemoveThreadSchema.parse(raw)
  const organizationId = principal.orgId()
  const [deleted] = await withDb((db) =>
    db
      .delete(ThreadTable)
      .where(and(eq(ThreadTable.id, input.id), eq(ThreadTable.organizationId, organizationId)))
      .returning({ id: ThreadTable.id }),
  )
  return deleted ?? null
}

export const ArchiveThreadSchema = z.object({ id: z.string() })

export async function archiveThread(raw: z.input<typeof ArchiveThreadSchema>) {
  const input = ArchiveThreadSchema.parse(raw)
  const organizationId = principal.orgId()
  const [updated] = await withDb((db) =>
    db
      .update(ThreadTable)
      .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(ThreadTable.id, input.id), eq(ThreadTable.organizationId, organizationId)))
      .returning({ id: ThreadTable.id }),
  )
  return updated ?? null
}

export const UnarchiveThreadSchema = z.object({ id: z.string() })

export async function unarchiveThread(raw: z.input<typeof UnarchiveThreadSchema>) {
  const input = UnarchiveThreadSchema.parse(raw)
  const organizationId = principal.orgId()
  const [updated] = await withDb((db) =>
    db
      .update(ThreadTable)
      .set({ archived: false, archivedAt: null, updatedAt: new Date() })
      .where(and(eq(ThreadTable.id, input.id), eq(ThreadTable.organizationId, organizationId)))
      .returning({ id: ThreadTable.id }),
  )
  return updated ?? null
}

export const CountThreadsSchema = z.object({ archived: z.boolean().optional() }).optional()

export async function countThreads(raw?: z.input<typeof CountThreadsSchema>) {
  CountThreadsSchema.parse(raw)
  const organizationId = principal.orgId()

  const accessibleChannels = await getAccessibleChannelIds()
  if (accessibleChannels !== null && accessibleChannels.length === 0) {
    return { byStatus: {}, byAgent: [], byChannel: [], archivedCount: 0 }
  }

  const baseConditions = [eq(ThreadTable.organizationId, organizationId), eq(ThreadTable.kind, "thread")]
  if (accessibleChannels !== null) {
    baseConditions.push(inArray(ThreadTable.channelId, accessibleChannels))
  }

  const inboxConditions = [...baseConditions, eq(ThreadTable.archived, false)]
  const archivedConditions = [...baseConditions, eq(ThreadTable.archived, true)]

  const [statusResults, agentResults, channelResults, archivedResult] = await Promise.all([
    withDb((db) =>
      db
        .select({
          status: ThreadTable.status,
          count: count(),
        })
        .from(ThreadTable)
        .where(and(...inboxConditions))
        .groupBy(ThreadTable.status),
    ),
    withDb((db) =>
      db
        .select({
          agentId: ThreadTable.agentId,
          agentName: AgentTable.name,
          agentSlug: AgentTable.slug,
          agentIcon: AgentTable.icon,
          agentIconColor: AgentTable.iconColor,
          count: count(),
        })
        .from(ThreadTable)
        .leftJoin(AgentTable, eq(ThreadTable.agentId, AgentTable.id))
        .where(and(...inboxConditions))
        .groupBy(ThreadTable.agentId, AgentTable.name, AgentTable.slug, AgentTable.icon, AgentTable.iconColor),
    ),
    withDb((db) =>
      db
        .select({
          channelId: ThreadTable.channelId,
          channelName: ChannelTable.name,
          channelSlug: ChannelTable.slug,
          channelIcon: ChannelTable.icon,
          channelIconColor: ChannelTable.iconColor,
          channelIsDefault: ChannelTable.isDefault,
          count: count(),
        })
        .from(ThreadTable)
        .innerJoin(ChannelTable, eq(ThreadTable.channelId, ChannelTable.id))
        .where(and(...inboxConditions))
        .groupBy(
          ThreadTable.channelId,
          ChannelTable.name,
          ChannelTable.slug,
          ChannelTable.icon,
          ChannelTable.iconColor,
          ChannelTable.isDefault,
        ),
    ),
    withDb((db) =>
      db
        .select({ count: count() })
        .from(ThreadTable)
        .where(and(...archivedConditions))
        .then((rows) => rows[0]?.count ?? 0),
    ),
  ])

  const byStatus: Record<string, number> = {}
  for (const row of statusResults) {
    byStatus[row.status] = row.count
  }

  const byAgent = agentResults.map((row) => ({
    id: row.agentId,
    name: row.agentName ?? row.agentId.slice(0, 8),
    slug: row.agentSlug,
    icon: row.agentIcon,
    iconColor: row.agentIconColor,
    count: row.count,
  }))

  const byChannel = channelResults.map((row) => ({
    id: row.channelId,
    name: row.channelName,
    slug: row.channelSlug,
    icon: row.channelIcon,
    iconColor: row.channelIconColor,
    isDefault: row.channelIsDefault,
    count: row.count,
  }))

  return { byStatus, byAgent, byChannel, archivedCount: archivedResult }
}

export const GetOrCreatePlaygroundThreadSchema = z.object({
  organizationId: z.string(),
  environmentId: z.string(),
  agentId: z.string(),
  userId: z.string(),
})

export async function getOrCreatePlaygroundThread(raw: z.input<typeof GetOrCreatePlaygroundThreadSchema>) {
  const input = GetOrCreatePlaygroundThreadSchema.parse(raw)
  const existing = await withDb((db) =>
    db
      .select()
      .from(ThreadTable)
      .where(
        and(
          eq(ThreadTable.kind, "playground"),
          eq(ThreadTable.agentId, input.agentId),
          eq(ThreadTable.userId, input.userId),
        ),
      )
      .orderBy(desc(ThreadTable.createdAt))
      .limit(1)
      .then(first),
  )

  if (existing) {
    const thread = await getThreadById(existing.id)
    return { thread, created: false }
  }

  const workflowId = `playground-${crypto.randomUUID()}`
  const [created] = await withDb((db) =>
    db
      .insert(ThreadTable)
      .values({
        organizationId: input.organizationId,
        environmentId: input.environmentId,
        agentId: input.agentId,
        userId: input.userId,
        kind: "playground",
        agentConfigHash: "",
        workflowId,
        subject: "Playground",
        payload: {},
        status: "waiting_human",
      })
      .returning(),
  )

  const thread = await getThreadById(created.id)
  return { thread, created: true }
}

export async function clearPlaygroundThread(threadId: string) {
  await withDb((db) => db.delete(MessageTable).where(eq(MessageTable.threadId, threadId)))
  await withDb((db) => db.delete(RunTable).where(eq(RunTable.threadId, threadId)))
  await withDb((db) => db.delete(OutputItemTable).where(eq(OutputItemTable.threadId, threadId)))
  await withDb((db) => db.delete(HumanRequestTable).where(eq(HumanRequestTable.threadId, threadId)))

  const [updated] = await withDb((db) =>
    db
      .update(ThreadTable)
      .set({
        status: "waiting_human",
        result: null,
        error: null,
        seq: 0,
        updatedAt: new Date(),
      })
      .where(eq(ThreadTable.id, threadId))
      .returning(),
  )

  return updated ?? null
}

export const UpdateThreadWithMessageSchema = z.object({
  threadId: z.string(),
  status: z.enum(ThreadStatus).optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  skipReason: z.string().optional(),
  incrementSeq: z.boolean().optional(),
  message: z
    .object({
      runId: z.string().optional(),
      type: z.enum(MessageType),
      content: z.string().optional(),
      toolCall: z.custom<ToolCallData>().optional(),
      toolResult: z.custom<ToolResultData>().optional(),
    })
    .optional(),
})

export async function updateThreadWithMessage(raw: z.input<typeof UpdateThreadWithMessageSchema>) {
  const input = UpdateThreadWithMessageSchema.parse(raw)
  const organizationId = principal.orgId()

  return withTx(async (tx) => {
    const thread = await tx
      .select()
      .from(ThreadTable)
      .where(and(eq(ThreadTable.id, input.threadId), eq(ThreadTable.organizationId, organizationId)))
      .then(first)

    if (!thread) {
      throw createError("NotFoundError", { type: "Thread", id: input.threadId })
    }

    const hasThreadUpdate =
      input.status !== undefined ||
      input.result !== undefined ||
      input.error !== undefined ||
      input.skipReason !== undefined

    const now = new Date()
    let updatedThread = thread

    if (hasThreadUpdate) {
      const updateData: Record<string, unknown> = { updatedAt: now }
      if (input.status !== undefined) updateData.status = input.status
      if (input.result !== undefined) updateData.result = input.result
      if (input.error !== undefined) updateData.error = input.error
      if (input.skipReason !== undefined) updateData.skipReason = input.skipReason

      const [updated] = await tx
        .update(ThreadTable)
        .set(updateData)
        .where(eq(ThreadTable.id, input.threadId))
        .returning()
      updatedThread = updated
    }

    if (input.message) {
      const [message] = await tx
        .insert(MessageTable)
        .values({
          threadId: input.threadId,
          runId: input.message.runId,
          type: input.message.type,
          content: input.message.content,
          toolCall: input.message.toolCall,
          toolResult: input.message.toolResult,
        })
        .returning()

      const newSeq = (thread.seq ?? 0) + 1
      const [seqUpdated] = await tx
        .update(ThreadTable)
        .set({ seq: newSeq, updatedAt: now })
        .where(eq(ThreadTable.id, input.threadId))
        .returning()

      return { message, seq: newSeq, updatedAt: now, thread: seqUpdated }
    }

    if (input.incrementSeq) {
      const newSeq = (thread.seq ?? 0) + 1
      const [seqUpdated] = await tx
        .update(ThreadTable)
        .set({ seq: newSeq, updatedAt: now })
        .where(eq(ThreadTable.id, input.threadId))
        .returning()

      return { message: undefined, seq: newSeq, updatedAt: now, thread: seqUpdated }
    }

    return {
      message: undefined,
      seq: thread.seq ?? 0,
      updatedAt: hasThreadUpdate ? now : undefined,
      thread: updatedThread,
    }
  })
}
