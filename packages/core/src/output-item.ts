import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import { createError } from "@synatra/util/error"
import { OutputItemTable } from "./schema/output-item.sql"
import { ThreadTable } from "./schema/thread.sql"
import { OutputKind } from "./types"

export const CreateOutputItemSchema = z.object({
  threadId: z.string(),
  runId: z.string().optional(),
  toolCallId: z.string().optional(),
  kind: z.enum(OutputKind),
  name: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
})

export const CreateAndIncrementSeqOutputItemSchema = z.object({
  threadId: z.string(),
  runId: z.string().optional(),
  toolCallId: z.string().optional(),
  kind: z.enum(OutputKind),
  name: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
})

export async function createOutputItem(input: z.input<typeof CreateOutputItemSchema>) {
  const data = CreateOutputItemSchema.parse(input)
  const [item] = await withDb((db) =>
    db
      .insert(OutputItemTable)
      .values({
        threadId: data.threadId,
        runId: data.runId,
        toolCallId: data.toolCallId ?? null,
        kind: data.kind,
        name: data.name,
        payload: data.payload,
      })
      .returning(),
  )

  await withDb((db) => db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, data.threadId)))

  return item
}

export async function findOutputItemById(id: string) {
  return withDb((db) =>
    db
      .select()
      .from(OutputItemTable)
      .where(eq(OutputItemTable.id, id))
      .then((rows) => rows[0] ?? null),
  )
}

export async function listOutputItemsByThread(threadId: string) {
  return withDb((db) =>
    db.select().from(OutputItemTable).where(eq(OutputItemTable.threadId, threadId)).orderBy(OutputItemTable.createdAt),
  )
}

export async function listOutputItemsByRun(runId: string) {
  return withDb((db) =>
    db.select().from(OutputItemTable).where(eq(OutputItemTable.runId, runId)).orderBy(OutputItemTable.createdAt),
  )
}

export async function createOutputItemAndIncrementSeq(input: z.input<typeof CreateAndIncrementSeqOutputItemSchema>) {
  const data = CreateAndIncrementSeqOutputItemSchema.parse(input)
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

    const [item] = await tx
      .insert(OutputItemTable)
      .values({
        threadId: data.threadId,
        runId: data.runId,
        toolCallId: data.toolCallId ?? null,
        kind: data.kind,
        name: data.name,
        payload: data.payload,
      })
      .returning()

    const newSeq = (thread.seq ?? 0) + 1
    await tx.update(ThreadTable).set({ seq: newSeq, updatedAt: new Date() }).where(eq(ThreadTable.id, data.threadId))

    return { item, seq: newSeq }
  })
}
