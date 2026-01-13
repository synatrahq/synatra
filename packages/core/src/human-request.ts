import { z } from "zod"
import { eq, and, desc } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import { createError } from "@synatra/util/error"
import { HumanRequestTable, HumanResponseTable } from "./schema/human-request.sql"
import { ThreadTable } from "./schema/thread.sql"
import {
  HumanRequestKind,
  HumanRequestStatus,
  HumanRequestAuthority,
  HumanRequestFallback,
  HumanResponseStatus,
  type HumanRequestConfig,
} from "./types"

export const CreateHumanRequestSchema = z.object({
  threadId: z.string(),
  runId: z.string().optional(),
  toolCallId: z.string().optional(),
  kind: z.enum(HumanRequestKind),
  title: z.string(),
  description: z.string().optional(),
  config: z.custom<HumanRequestConfig>(),
  authority: z.enum(HumanRequestAuthority).default("any_member"),
  timeoutMs: z.number().optional(),
  fallback: z.enum(HumanRequestFallback).optional(),
})

export const UpdateStatusHumanRequestSchema = z.object({
  id: z.string(),
  status: z.enum(HumanRequestStatus),
})

export const CreateAndIncrementSeqHumanRequestSchema = z.object({
  threadId: z.string(),
  runId: z.string().optional(),
  toolCallId: z.string().optional(),
  kind: z.enum(HumanRequestKind),
  title: z.string(),
  description: z.string().optional(),
  config: z.custom<HumanRequestConfig>(),
  authority: z.enum(HumanRequestAuthority).optional(),
  timeoutMs: z.number().optional(),
  fallback: z.enum(HumanRequestFallback).optional(),
})

export const CreateHumanResponseSchema = z.object({
  requestId: z.string(),
  status: z.enum(HumanResponseStatus),
  respondedBy: z.string().optional(),
  data: z.unknown().optional(),
})

export async function createHumanRequest(input: z.input<typeof CreateHumanRequestSchema>) {
  const data = CreateHumanRequestSchema.parse(input)
  const expiresAt = typeof data.timeoutMs === "number" ? new Date(Date.now() + data.timeoutMs) : undefined

  const [request] = await withDb((db) =>
    db
      .insert(HumanRequestTable)
      .values({
        threadId: data.threadId,
        runId: data.runId,
        toolCallId: data.toolCallId ?? null,
        kind: data.kind,
        title: data.title,
        description: data.description,
        config: data.config,
        authority: data.authority,
        timeoutMs: data.timeoutMs,
        fallback: data.fallback,
        expiresAt,
        status: "pending",
      })
      .returning(),
  )

  await withDb((db) => db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, data.threadId)))

  return request
}

export async function findHumanRequestById(id: string) {
  return withDb((db) =>
    db
      .select()
      .from(HumanRequestTable)
      .where(eq(HumanRequestTable.id, id))
      .then((rows) => rows[0] ?? null),
  )
}

export async function pendingHumanRequestByThread(threadId: string) {
  return withDb((db) =>
    db
      .select()
      .from(HumanRequestTable)
      .where(and(eq(HumanRequestTable.threadId, threadId), eq(HumanRequestTable.status, "pending")))
      .orderBy(desc(HumanRequestTable.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
}

export async function pendingHumanRequestByRun(runId: string) {
  return withDb((db) =>
    db
      .select()
      .from(HumanRequestTable)
      .where(and(eq(HumanRequestTable.runId, runId), eq(HumanRequestTable.status, "pending")))
      .then((rows) => rows[0] ?? null),
  )
}

export async function listHumanRequestsByThread(threadId: string) {
  return withDb((db) =>
    db
      .select()
      .from(HumanRequestTable)
      .where(eq(HumanRequestTable.threadId, threadId))
      .orderBy(HumanRequestTable.createdAt),
  )
}

export async function updateHumanRequestStatus(input: z.input<typeof UpdateStatusHumanRequestSchema>) {
  const data = UpdateStatusHumanRequestSchema.parse(input)
  const [updated] = await withDb((db) =>
    db
      .update(HumanRequestTable)
      .set({ status: data.status, updatedAt: new Date() })
      .where(eq(HumanRequestTable.id, data.id))
      .returning(),
  )

  return updated ?? null
}

export async function cancelHumanRequest(id: string) {
  const [updated] = await withDb((db) =>
    db
      .update(HumanRequestTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(HumanRequestTable.id, id))
      .returning(),
  )

  return updated ?? null
}

export async function createHumanRequestAndIncrementSeq(
  input: z.input<typeof CreateAndIncrementSeqHumanRequestSchema>,
) {
  const data = CreateAndIncrementSeqHumanRequestSchema.parse(input)
  const organizationId = principal.orgId()

  return withTx(async (tx) => {
    const thread = await tx
      .select({ id: ThreadTable.id, seq: ThreadTable.seq })
      .from(ThreadTable)
      .where(and(eq(ThreadTable.id, data.threadId), eq(ThreadTable.organizationId, organizationId)))
      .then(first)

    if (!thread) {
      throw createError("NotFoundError", { type: "Thread", id: data.threadId })
    }

    const expiresAt = typeof data.timeoutMs === "number" ? new Date(Date.now() + data.timeoutMs) : undefined

    const [request] = await tx
      .insert(HumanRequestTable)
      .values({
        threadId: data.threadId,
        runId: data.runId,
        toolCallId: data.toolCallId ?? null,
        kind: data.kind,
        title: data.title,
        description: data.description,
        config: data.config,
        authority: data.authority ?? "any_member",
        timeoutMs: data.timeoutMs,
        fallback: data.fallback,
        expiresAt,
        status: "pending",
      })
      .returning()

    const newSeq = (thread.seq ?? 0) + 1
    await tx.update(ThreadTable).set({ seq: newSeq, updatedAt: new Date() }).where(eq(ThreadTable.id, data.threadId))

    return { request, seq: newSeq }
  })
}

function tryGetUserId(): string | undefined {
  const item = principal.current()
  if (item?.kind === "user") return item.userId
  return undefined
}

export async function createHumanResponse(input: z.input<typeof CreateHumanResponseSchema>) {
  const data = CreateHumanResponseSchema.parse(input)
  const respondedBy = data.respondedBy ?? tryGetUserId()

  const [response] = await withDb((db) =>
    db
      .insert(HumanResponseTable)
      .values({
        requestId: data.requestId,
        status: data.status,
        respondedBy,
        data: data.data,
      })
      .returning(),
  )

  const requestStatus = data.status === "cancelled" ? "cancelled" : data.status === "skipped" ? "skipped" : "responded"
  await withDb((db) =>
    db
      .update(HumanRequestTable)
      .set({ status: requestStatus, updatedAt: new Date() })
      .where(eq(HumanRequestTable.id, data.requestId)),
  )

  return response
}

export async function findHumanResponseByRequestId(requestId: string) {
  return withDb((db) =>
    db
      .select()
      .from(HumanResponseTable)
      .where(eq(HumanResponseTable.requestId, requestId))
      .then((rows) => rows[0] ?? null),
  )
}
