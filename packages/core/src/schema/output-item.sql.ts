import { index, pgEnum, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ThreadTable } from "./thread.sql"
import { RunTable } from "./run.sql"
import { OutputKind } from "../types"

export const outputKindEnum = pgEnum("output_kind", OutputKind)

export const OutputItemTable = pgTable(
  "output_item",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => ThreadTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => RunTable.id, { onDelete: "set null" }),
    toolCallId: text("tool_call_id"),
    kind: outputKindEnum("kind").notNull(),
    name: text("name"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("output_item_thread_idx").on(table.threadId, table.createdAt),
    index("output_item_run_idx").on(table.runId),
    index("output_item_tool_call_idx").on(table.toolCallId),
  ],
)

export type OutputItem = typeof OutputItemTable.$inferSelect
