import { index, pgEnum, pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ThreadTable } from "./thread.sql"
import { AgentTable, AgentReleaseTable } from "./agent.sql"
import { RunStatus } from "../types"

export const runStatusEnum = pgEnum("run_status", RunStatus)

export const RunTable = pgTable(
  "run",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => ThreadTable.id, { onDelete: "cascade" }),
    parentRunId: uuid("parent_run_id").references((): any => RunTable.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull().default(0),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    agentReleaseId: uuid("agent_release_id").references(() => AgentReleaseTable.id, { onDelete: "set null" }),
    status: runStatusEnum("status").notNull().default("running"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("run_thread_idx").on(table.threadId, table.createdAt),
    index("run_parent_idx").on(table.parentRunId),
    index("run_thread_depth_idx").on(table.threadId, table.depth, table.createdAt),
  ],
)

export type Run = typeof RunTable.$inferSelect
