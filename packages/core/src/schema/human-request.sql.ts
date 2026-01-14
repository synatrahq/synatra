import { index, pgEnum, pgTable, text, timestamp, uuid, jsonb, integer, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ThreadTable } from "./thread.sql"
import { RunTable } from "./run.sql"
import { UserTable } from "./user.sql"
import {
  HumanRequestKind,
  HumanRequestStatus,
  HumanRequestAuthority,
  HumanRequestFallback,
  HumanResponseStatus,
  type HumanRequestConfig,
} from "../types"

export const humanRequestKindEnum = pgEnum("human_request_kind", HumanRequestKind)
export const humanRequestStatusEnum = pgEnum("human_request_status", HumanRequestStatus)
export const humanRequestAuthorityEnum = pgEnum("human_request_authority", HumanRequestAuthority)
export const humanRequestFallbackEnum = pgEnum("human_request_fallback", HumanRequestFallback)
export const humanResponseStatusEnum = pgEnum("human_response_status", HumanResponseStatus)

export const HumanRequestTable = pgTable(
  "human_request",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    threadId: uuid("thread_id")
      .notNull()
      .references(() => ThreadTable.id, { onDelete: "cascade" }),

    runId: uuid("run_id").references(() => RunTable.id, { onDelete: "set null" }),

    toolCallId: text("tool_call_id"),

    kind: humanRequestKindEnum("kind").notNull(),

    title: text("title").notNull(),

    description: text("description"),

    config: jsonb("config").$type<HumanRequestConfig>().notNull(),

    authority: humanRequestAuthorityEnum("authority").default("any_member"),

    timeoutMs: integer("timeout_ms"),

    fallback: humanRequestFallbackEnum("fallback"),

    expiresAt: timestamp("expires_at", { withTimezone: true }),

    status: humanRequestStatusEnum("status").notNull().default("pending"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("human_request_thread_idx").on(table.threadId),
    index("human_request_run_idx").on(table.runId),
    index("human_request_tool_call_idx").on(table.toolCallId),
    index("human_request_status_idx").on(table.status, table.expiresAt),
    uniqueIndex("human_request_pending_thread_idx")
      .on(table.threadId)
      .where(sql`status = 'pending'`),
  ],
)

export const HumanResponseTable = pgTable(
  "human_response",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    requestId: uuid("request_id")
      .notNull()
      .references(() => HumanRequestTable.id, { onDelete: "cascade" }),

    status: humanResponseStatusEnum("status").notNull(),

    respondedBy: uuid("responded_by").references(() => UserTable.id, { onDelete: "set null" }),

    data: jsonb("data").$type<unknown>(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("human_response_request_idx").on(table.requestId)],
)

export type HumanRequest = typeof HumanRequestTable.$inferSelect
export type HumanResponse = typeof HumanResponseTable.$inferSelect
