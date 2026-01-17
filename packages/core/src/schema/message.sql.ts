import { index, pgEnum, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ThreadTable } from "./thread.sql"
import { RunTable } from "./run.sql"
import { MessageType, type ToolCallData, type ToolResultData } from "../types"

export const messageTypeEnum = pgEnum("message_type", MessageType)

export const MessageTable = pgTable(
  "message",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => ThreadTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => RunTable.id, { onDelete: "set null" }),
    type: messageTypeEnum("type").notNull(),
    content: text("content"),
    toolCall: jsonb("tool_call").$type<ToolCallData>(),
    toolResult: jsonb("tool_result").$type<ToolResultData>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("message_thread_idx").on(table.threadId, table.createdAt),
    index("message_run_idx").on(table.runId),
  ],
)

export type Message = typeof MessageTable.$inferSelect
