import {
  pgTable,
  pgEnum,
  uniqueIndex,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  integer,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { AgentTable, AgentReleaseTable } from "./agent.sql"
import { PromptTable, PromptReleaseTable } from "./prompt.sql"
import { EnvironmentTable } from "./environment.sql"
import { ChannelTable } from "./channel.sql"
import { UserTable } from "./user.sql"
import { AppAccountTable } from "./app-account.sql"
import { TriggerType, VersionMode, TriggerMode } from "../types"

export const triggerTypeEnum = pgEnum("trigger_type", TriggerType)
export const versionModeEnum = pgEnum("version_mode", VersionMode)
export const triggerModeEnum = pgEnum("trigger_mode", TriggerMode)

export const TriggerTable = pgTable(
  "trigger",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .references(() => OrganizationTable.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    currentReleaseId: uuid("current_release_id"),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("trigger_org_slug_idx").on(table.organizationId, table.slug),
    index("trigger_current_release_idx").on(table.currentReleaseId),
  ],
)

export const TriggerReleaseTable = pgTable(
  "trigger_release",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    triggerId: uuid("trigger_id")
      .references(() => TriggerTable.id, { onDelete: "cascade" })
      .notNull(),
    version: text("version").notNull(),
    versionMajor: integer("version_major").notNull(),
    versionMinor: integer("version_minor").notNull(),
    versionPatch: integer("version_patch").notNull(),
    description: text("description").default("").notNull(),
    agentId: uuid("agent_id")
      .references(() => AgentTable.id, { onDelete: "cascade" })
      .notNull(),
    agentReleaseId: uuid("agent_release_id").references(() => AgentReleaseTable.id, { onDelete: "set null" }),
    agentVersionMode: versionModeEnum("agent_version_mode").default("current").notNull(),
    promptId: uuid("prompt_id").references(() => PromptTable.id, { onDelete: "set null" }),
    promptReleaseId: uuid("prompt_release_id").references(() => PromptReleaseTable.id, { onDelete: "set null" }),
    promptVersionMode: versionModeEnum("prompt_version_mode").default("current").notNull(),
    mode: triggerModeEnum("mode").default("template").notNull(),
    template: text("template").default("").notNull(),
    script: text("script").default("").notNull(),
    payloadSchema: jsonb("payload_schema"),
    type: triggerTypeEnum("type").notNull(),
    cron: text("cron"),
    timezone: text("timezone").default("UTC").notNull(),
    input: jsonb("input"),
    appAccountId: uuid("app_account_id").references(() => AppAccountTable.id, { onDelete: "set null" }),
    appEvents: text("app_events").array(),
    configHash: text("config_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("trigger_release_unique_idx").on(table.triggerId, table.version),
    uniqueIndex("trigger_release_semver_idx").on(
      table.triggerId,
      table.versionMajor,
      table.versionMinor,
      table.versionPatch,
    ),
  ],
)

export const TriggerWorkingCopyTable = pgTable("trigger_working_copy", {
  triggerId: uuid("trigger_id")
    .references(() => TriggerTable.id, { onDelete: "cascade" })
    .primaryKey(),
  agentId: uuid("agent_id")
    .references(() => AgentTable.id, { onDelete: "cascade" })
    .notNull(),
  agentReleaseId: uuid("agent_release_id").references(() => AgentReleaseTable.id, { onDelete: "set null" }),
  agentVersionMode: versionModeEnum("agent_version_mode").default("current").notNull(),
  promptId: uuid("prompt_id").references(() => PromptTable.id, { onDelete: "set null" }),
  promptReleaseId: uuid("prompt_release_id").references(() => PromptReleaseTable.id, { onDelete: "set null" }),
  promptVersionMode: versionModeEnum("prompt_version_mode").default("current").notNull(),
  mode: triggerModeEnum("mode").default("template").notNull(),
  template: text("template").default("").notNull(),
  script: text("script").default("").notNull(),
  payloadSchema: jsonb("payload_schema"),
  type: triggerTypeEnum("type").default("webhook").notNull(),
  cron: text("cron"),
  timezone: text("timezone").default("UTC").notNull(),
  input: jsonb("input"),
  appAccountId: uuid("app_account_id").references(() => AppAccountTable.id, { onDelete: "set null" }),
  appEvents: text("app_events").array(),
  configHash: text("config_hash").notNull(),
  updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const TriggerEnvironmentTable = pgTable(
  "trigger_environment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    triggerId: uuid("trigger_id")
      .references(() => TriggerTable.id, { onDelete: "cascade" })
      .notNull(),
    environmentId: uuid("environment_id")
      .references(() => EnvironmentTable.id, { onDelete: "cascade" })
      .notNull(),
    channelId: uuid("channel_id")
      .references(() => ChannelTable.id, { onDelete: "cascade" })
      .notNull(),
    webhookSecret: text("webhook_secret"),
    debugSecret: text("debug_secret"),
    active: boolean("active").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("trigger_environment_idx").on(table.triggerId, table.environmentId),
    index("trigger_environment_channel_idx").on(table.channelId),
    index("trigger_environment_active_idx").on(table.environmentId, table.active),
  ],
)

export type Trigger = typeof TriggerTable.$inferSelect
export type TriggerRelease = typeof TriggerReleaseTable.$inferSelect
export type TriggerWorkingCopy = typeof TriggerWorkingCopyTable.$inferSelect
export type TriggerEnvironment = typeof TriggerEnvironmentTable.$inferSelect
