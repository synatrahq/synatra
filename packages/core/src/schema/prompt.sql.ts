import { pgTable, pgEnum, uniqueIndex, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { AgentTable } from "./agent.sql"
import { UserTable } from "./user.sql"
import { PromptMode } from "../types"

export const promptModeEnum = pgEnum("prompt_mode", PromptMode)

export const PromptTable = pgTable(
  "prompt",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .references(() => OrganizationTable.id, { onDelete: "cascade" })
      .notNull(),
    agentId: uuid("agent_id")
      .references(() => AgentTable.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    currentReleaseId: uuid("current_release_id"),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("prompt_org_slug_idx").on(table.organizationId, table.slug)],
)

export const PromptReleaseTable = pgTable(
  "prompt_release",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    promptId: uuid("prompt_id")
      .references(() => PromptTable.id, { onDelete: "cascade" })
      .notNull(),
    version: text("version").notNull(),
    versionMajor: integer("version_major").notNull(),
    versionMinor: integer("version_minor").notNull(),
    versionPatch: integer("version_patch").notNull(),
    description: text("description").default("").notNull(),
    mode: promptModeEnum("mode").default("template").notNull(),
    content: text("content").default("").notNull(),
    script: text("script").default("").notNull(),
    inputSchema: jsonb("input_schema"),
    contentHash: text("content_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("prompt_release_unique_idx").on(table.promptId, table.version),
    uniqueIndex("prompt_release_semver_idx").on(
      table.promptId,
      table.versionMajor,
      table.versionMinor,
      table.versionPatch,
    ),
  ],
)

export const PromptWorkingCopyTable = pgTable(
  "prompt_working_copy",
  {
    promptId: uuid("prompt_id")
      .references(() => PromptTable.id, { onDelete: "cascade" })
      .primaryKey(),
    mode: promptModeEnum("mode").default("template").notNull(),
    content: text("content").default("").notNull(),
    script: text("script").default("").notNull(),
    inputSchema: jsonb("input_schema"),
    contentHash: text("content_hash").notNull(),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("prompt_working_copy_prompt_idx").on(table.promptId)],
)

export type Prompt = typeof PromptTable.$inferSelect
export type PromptRelease = typeof PromptReleaseTable.$inferSelect
export type PromptWorkingCopy = typeof PromptWorkingCopyTable.$inferSelect
