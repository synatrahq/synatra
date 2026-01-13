import { z } from "zod"
import { and, eq, sql } from "drizzle-orm"
import { withDb } from "./database"
import { MessageTable } from "./schema/message.sql"
import { ThreadTable } from "./schema/thread.sql"
import { MessageType } from "./types"

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  params: z.record(z.string(), z.unknown()),
})

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  result: z.unknown(),
  error: z.string().optional(),
})

export const CreateMessageSchema = z.object({
  threadId: z.string(),
  runId: z.string().optional(),
  type: z.enum(MessageType),
  content: z.string().optional(),
  toolCall: ToolCallSchema.optional(),
  toolResult: ToolResultSchema.optional(),
})

export const UpdateMessageToolResultStatusSchema = z.object({
  threadId: z.string(),
  toolCallId: z.string(),
  status: z.enum(["submitted", "dismissed"]),
})

export const FindMessageToolResultByCallIdSchema = z.object({ threadId: z.string(), toolCallId: z.string() })

export async function createMessage(input: z.input<typeof CreateMessageSchema>) {
  const data = CreateMessageSchema.parse(input)
  const [message] = await withDb((db) =>
    db
      .insert(MessageTable)
      .values({
        threadId: data.threadId,
        runId: data.runId,
        type: data.type,
        content: data.content,
        toolCall: data.toolCall,
        toolResult: data.toolResult,
      })
      .returning(),
  )

  await withDb((db) => db.update(ThreadTable).set({ updatedAt: new Date() }).where(eq(ThreadTable.id, data.threadId)))

  return message
}

export async function updateMessageToolResultStatus(input: z.input<typeof UpdateMessageToolResultStatusSchema>) {
  const data = UpdateMessageToolResultStatusSchema.parse(input)
  const [message] = await withDb((db) =>
    db
      .update(MessageTable)
      .set({
        toolResult: sql`jsonb_set(${MessageTable.toolResult}, '{result,status}', ${JSON.stringify(data.status)}::jsonb)`,
      })
      .where(
        and(
          eq(MessageTable.threadId, data.threadId),
          eq(MessageTable.type, "tool_result"),
          sql`${MessageTable.toolResult}->>'toolCallId' = ${data.toolCallId}`,
        ),
      )
      .returning(),
  )
  return message
}

export async function findMessageToolResultByCallId(input: z.input<typeof FindMessageToolResultByCallIdSchema>) {
  const data = FindMessageToolResultByCallIdSchema.parse(input)
  const messages = await withDb((db) =>
    db
      .select()
      .from(MessageTable)
      .where(and(eq(MessageTable.threadId, data.threadId), eq(MessageTable.type, "tool_result"))),
  )
  return messages.find((m) => m.toolResult?.toolCallId === data.toolCallId)
}

export async function listMessagesByThread(threadId: string) {
  return withDb((db) =>
    db
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.threadId, threadId))
      .orderBy(MessageTable.createdAt, MessageTable.id),
  )
}
