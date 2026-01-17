import { index, pgEnum, pgTable, text, timestamp, uuid, jsonb, bigint, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { EnvironmentTable } from "./environment.sql"
import { ChannelTable } from "./channel.sql"
import { TriggerTable, TriggerReleaseTable } from "./trigger.sql"
import { AgentTable, AgentReleaseTable } from "./agent.sql"
import { UserTable } from "./user.sql"
import { ThreadKind, ThreadStatus } from "../types"

export const threadKindEnum = pgEnum("thread_kind", ThreadKind)
export const threadStatusEnum = pgEnum("thread_status", ThreadStatus)

export const ThreadTable = pgTable(
  "thread",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    kind: threadKindEnum("kind").notNull().default("thread"),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => EnvironmentTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    agentReleaseId: uuid("agent_release_id").references(() => AgentReleaseTable.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => ChannelTable.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id").references(() => TriggerTable.id, { onDelete: "set null" }),
    triggerReleaseId: uuid("trigger_release_id").references(() => TriggerReleaseTable.id, { onDelete: "set null" }),
    isDebug: boolean("is_debug").default(false).notNull(),
    agentConfigHash: text("agent_config_hash").notNull(),
    workflowId: text("workflow_id").notNull(),
    subject: text("subject").notNull(),
    status: threadStatusEnum("status").notNull().default("running"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<unknown>(),
    error: text("error"),
    skipReason: text("skip_reason"),
    seq: bigint("seq", { mode: "number" }).notNull().default(0),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => UserTable.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("thread_org_agent_idx").on(table.organizationId, table.agentId, table.createdAt),
    index("thread_org_agent_release_idx").on(table.organizationId, table.agentReleaseId, table.createdAt),
    index("thread_org_trigger_idx").on(table.organizationId, table.triggerId, table.createdAt),
    index("thread_trigger_release_idx").on(table.triggerReleaseId, table.createdAt),
    index("thread_org_env_idx").on(table.organizationId, table.environmentId, table.createdAt),
    index("thread_org_status_idx").on(table.organizationId, table.status, table.createdAt),
    index("thread_channel_idx").on(table.channelId, table.updatedAt),
    index("thread_channel_status_idx").on(table.channelId, table.status, table.updatedAt),
    index("thread_channel_archived_idx").on(table.channelId, table.archived, table.updatedAt),
    index("thread_kind_user_idx").on(table.kind, table.createdBy, table.createdAt),
    index("thread_playground_idx").on(table.kind, table.agentId, table.userId, table.createdAt),
  ],
)

export type Thread = typeof ThreadTable.$inferSelect
