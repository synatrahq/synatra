import { sql } from "drizzle-orm"
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid, integer, index } from "drizzle-orm/pg-core"
import { OrganizationTable } from "./organization.sql"
import { UserTable } from "./user.sql"
import type { AgentRuntimeConfig } from "../types"
import { AgentTemplateTable } from "./agent-template.sql"

export const AgentTable = pgTable(
  "agent",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .references(() => OrganizationTable.id, { onDelete: "cascade" })
      .notNull(),
    templateId: uuid("template_id").references(() => AgentTemplateTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    icon: text("icon").default("CircleDashed").notNull(),
    iconColor: text("icon_color").default("blue").notNull(),
    currentReleaseId: uuid("current_release_id"),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_org_slug_idx").on(table.organizationId, table.slug),
    index("agent_template_idx").on(table.templateId),
  ],
)

export const AgentWorkingCopyTable = pgTable(
  "agent_working_copy",
  {
    agentId: uuid("agent_id")
      .references(() => AgentTable.id, { onDelete: "cascade" })
      .primaryKey(),
    runtimeConfig: jsonb("runtime_config").$type<AgentRuntimeConfig>().notNull(),
    configHash: text("config_hash").notNull(),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("agent_working_copy_agent_idx").on(table.agentId)],
)

export const AgentReleaseTable = pgTable(
  "agent_release",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .references(() => AgentTable.id, { onDelete: "cascade" })
      .notNull(),
    version: text("version").notNull(),
    versionMajor: integer("version_major").notNull(),
    versionMinor: integer("version_minor").notNull(),
    versionPatch: integer("version_patch").notNull(),
    description: text("description").default("").notNull(),
    runtimeConfig: jsonb("runtime_config").$type<AgentRuntimeConfig>().notNull(),
    configHash: text("config_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_release_unique_idx").on(table.agentId, table.version),
    uniqueIndex("agent_release_semver_idx").on(
      table.agentId,
      table.versionMajor,
      table.versionMinor,
      table.versionPatch,
    ),
  ],
)

export type Agent = typeof AgentTable.$inferSelect
export type AgentWorkingCopy = typeof AgentWorkingCopyTable.$inferSelect
export type AgentRelease = typeof AgentReleaseTable.$inferSelect
