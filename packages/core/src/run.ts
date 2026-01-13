import { z } from "zod"
import { eq, and, desc } from "drizzle-orm"
import { withDb } from "./database"
import { RunTable } from "./schema/run.sql"
import { ThreadTable } from "./schema/thread.sql"
import { RunStatus } from "./types"

export const CreateRunSchema = z.object({
  threadId: z.string(),
  parentRunId: z.string().optional(),
  depth: z.number().default(0),
  agentId: z.string(),
  agentReleaseId: z.string().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
})

export const UpdateRunSchema = z.object({
  id: z.string(),
  status: z.enum(RunStatus).optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  completedAt: z.date().optional(),
  durationMs: z.number().optional(),
})

export const CompleteRunSchema = z.object({
  id: z.string(),
  output: z.unknown().optional(),
  durationMs: z.number().optional(),
})

export const FailRunSchema = z.object({
  id: z.string(),
  error: z.string(),
  durationMs: z.number().optional(),
})

export async function createRun(raw: z.input<typeof CreateRunSchema>) {
  const input = CreateRunSchema.parse(raw)
  const [run] = await withDb((db) =>
    db
      .insert(RunTable)
      .values({
        threadId: input.threadId,
        parentRunId: input.parentRunId,
        depth: input.depth,
        agentId: input.agentId,
        agentReleaseId: input.agentReleaseId,
        status: "running",
        input: input.input,
      })
      .returning(),
  )

  await withDb((db) => db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, input.threadId)))

  return run
}

export async function updateRun(raw: z.input<typeof UpdateRunSchema>) {
  const input = UpdateRunSchema.parse(raw)
  const hasChange =
    input.status !== undefined ||
    input.output !== undefined ||
    input.error !== undefined ||
    input.completedAt !== undefined ||
    input.durationMs !== undefined
  if (!hasChange) return null

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.status !== undefined) updateData.status = input.status
  if (input.output !== undefined) updateData.output = input.output
  if (input.error !== undefined) updateData.error = input.error
  if (input.completedAt !== undefined) updateData.completedAt = input.completedAt
  if (input.durationMs !== undefined) updateData.durationMs = input.durationMs

  const [updated] = await withDb((db) =>
    db.update(RunTable).set(updateData).where(eq(RunTable.id, input.id)).returning(),
  )

  if (updated) {
    await withDb((db) =>
      db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, updated.threadId)),
    )
  }

  return updated ?? null
}

export async function findRunById(id: string) {
  return withDb((db) =>
    db
      .select()
      .from(RunTable)
      .where(eq(RunTable.id, id))
      .then((rows) => rows[0] ?? null),
  )
}

export async function listRunsByThread(threadId: string) {
  return withDb((db) =>
    db.select().from(RunTable).where(eq(RunTable.threadId, threadId)).orderBy(desc(RunTable.createdAt)),
  )
}

export async function listRunsByParent(parentRunId: string) {
  return withDb((db) =>
    db.select().from(RunTable).where(eq(RunTable.parentRunId, parentRunId)).orderBy(desc(RunTable.createdAt)),
  )
}

export async function rootRunByThread(threadId: string) {
  return withDb((db) =>
    db
      .select()
      .from(RunTable)
      .where(and(eq(RunTable.threadId, threadId), eq(RunTable.depth, 0)))
      .orderBy(desc(RunTable.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
}

export async function completeRun(raw: z.input<typeof CompleteRunSchema>) {
  const input = CompleteRunSchema.parse(raw)
  const updateData: Record<string, unknown> = {
    status: "completed",
    completedAt: new Date(),
    updatedAt: new Date(),
  }
  if (input.output !== undefined) updateData.output = input.output
  if (input.durationMs !== undefined) updateData.durationMs = input.durationMs

  const [updated] = await withDb((db) =>
    db.update(RunTable).set(updateData).where(eq(RunTable.id, input.id)).returning(),
  )

  if (updated) {
    await withDb((db) =>
      db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, updated.threadId)),
    )
  }

  return updated ?? null
}

export async function failRun(raw: z.input<typeof FailRunSchema>) {
  const input = FailRunSchema.parse(raw)
  const updateData: Record<string, unknown> = {
    status: "failed",
    error: input.error,
    completedAt: new Date(),
    updatedAt: new Date(),
  }
  if (input.durationMs !== undefined) updateData.durationMs = input.durationMs

  const [updated] = await withDb((db) =>
    db.update(RunTable).set(updateData).where(eq(RunTable.id, input.id)).returning(),
  )

  if (updated) {
    await withDb((db) =>
      db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, updated.threadId)),
    )
  }

  return updated ?? null
}
