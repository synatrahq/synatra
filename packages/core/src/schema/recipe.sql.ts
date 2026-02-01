import { index, pgEnum, pgTable, text, timestamp, uuid, jsonb, uniqueIndex, integer, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { EnvironmentTable } from "./environment.sql"
import { AgentTable, AgentReleaseTable } from "./agent.sql"
import { ThreadTable } from "./thread.sql"
import { RunTable } from "./run.sql"
import { UserTable } from "./user.sql"
import { RecipeStepType } from "../types"
import type { RecipeInput, RecipeOutput, PendingInputConfig, RecipeStepConfig } from "../types"
import { versionModeEnum } from "./trigger.sql"
export const recipeStepTypeEnum = pgEnum("recipe_step_type", RecipeStepType)

export const RecipeTable = pgTable(
  "recipe",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => AgentTable.id, { onDelete: "set null" }),
    sourceThreadId: uuid("source_thread_id").references(() => ThreadTable.id, { onDelete: "set null" }),
    sourceRunId: uuid("source_run_id").references(() => RunTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    icon: text("icon").default("ListChecks").notNull(),
    iconColor: text("icon_color").default("indigo").notNull(),
    currentReleaseId: uuid("current_release_id"),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("recipe_org_slug_idx").on(table.organizationId, table.slug),
    index("recipe_org_agent_idx").on(table.organizationId, table.agentId, table.createdAt),
    index("recipe_current_release_idx").on(table.currentReleaseId),
  ],
)

export type Recipe = typeof RecipeTable.$inferSelect

export const RecipeReleaseTable = pgTable(
  "recipe_release",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => RecipeTable.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    versionMajor: integer("version_major").notNull(),
    versionMinor: integer("version_minor").notNull(),
    versionPatch: integer("version_patch").notNull(),
    description: text("description").default("").notNull(),
    agentReleaseId: uuid("agent_release_id").references(() => AgentReleaseTable.id, { onDelete: "set null" }),
    agentVersionMode: versionModeEnum("agent_version_mode").default("current").notNull(),
    inputs: jsonb("inputs").$type<RecipeInput[]>().notNull().default([]),
    outputs: jsonb("outputs").$type<RecipeOutput[]>().notNull().default([]),
    configHash: text("config_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("recipe_release_unique_idx").on(table.recipeId, table.version),
    uniqueIndex("recipe_release_semver_idx").on(
      table.recipeId,
      table.versionMajor,
      table.versionMinor,
      table.versionPatch,
    ),
    index("recipe_release_recipe_idx").on(table.recipeId, table.createdAt),
  ],
)

export type RecipeRelease = typeof RecipeReleaseTable.$inferSelect

export const RecipeWorkingCopyTable = pgTable("recipe_working_copy", {
  recipeId: uuid("recipe_id")
    .primaryKey()
    .references(() => RecipeTable.id, { onDelete: "cascade" }),
  agentReleaseId: uuid("agent_release_id").references(() => AgentReleaseTable.id, { onDelete: "set null" }),
  agentVersionMode: versionModeEnum("agent_version_mode").default("current").notNull(),
  inputs: jsonb("inputs").$type<RecipeInput[]>().notNull().default([]),
  outputs: jsonb("outputs").$type<RecipeOutput[]>().notNull().default([]),
  configHash: text("config_hash").notNull(),
  updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export type RecipeWorkingCopy = typeof RecipeWorkingCopyTable.$inferSelect

export const RecipeStepTable = pgTable(
  "recipe_step",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workingCopyRecipeId: uuid("working_copy_recipe_id").references(() => RecipeWorkingCopyTable.recipeId, {
      onDelete: "cascade",
    }),
    releaseId: uuid("release_id").references(() => RecipeReleaseTable.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    label: text("label").notNull(),
    type: recipeStepTypeEnum("type").notNull(),
    config: jsonb("config").$type<RecipeStepConfig>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("recipe_step_working_copy_idx").on(table.workingCopyRecipeId),
    index("recipe_step_release_idx").on(table.releaseId),
    uniqueIndex("recipe_step_working_copy_key_idx")
      .on(table.workingCopyRecipeId, table.stepKey)
      .where(sql`working_copy_recipe_id IS NOT NULL`),
    uniqueIndex("recipe_step_release_key_idx")
      .on(table.releaseId, table.stepKey)
      .where(sql`release_id IS NOT NULL`),
    check(
      "recipe_step_parent_check",
      sql`(working_copy_recipe_id IS NOT NULL AND release_id IS NULL) OR (working_copy_recipe_id IS NULL AND release_id IS NOT NULL)`,
    ),
  ],
)

export type RecipeStep = typeof RecipeStepTable.$inferSelect

export const RecipeEdgeTable = pgTable(
  "recipe_edge",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workingCopyRecipeId: uuid("working_copy_recipe_id").references(() => RecipeWorkingCopyTable.recipeId, {
      onDelete: "cascade",
    }),
    releaseId: uuid("release_id").references(() => RecipeReleaseTable.id, { onDelete: "cascade" }),
    fromStepId: uuid("from_step_id")
      .notNull()
      .references(() => RecipeStepTable.id, { onDelete: "cascade" }),
    toStepId: uuid("to_step_id")
      .notNull()
      .references(() => RecipeStepTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("recipe_edge_working_copy_idx").on(table.workingCopyRecipeId),
    index("recipe_edge_release_idx").on(table.releaseId),
    uniqueIndex("recipe_edge_working_copy_unique_idx")
      .on(table.workingCopyRecipeId, table.fromStepId, table.toStepId)
      .where(sql`working_copy_recipe_id IS NOT NULL`),
    uniqueIndex("recipe_edge_release_unique_idx")
      .on(table.releaseId, table.fromStepId, table.toStepId)
      .where(sql`release_id IS NOT NULL`),
    check(
      "recipe_edge_parent_check",
      sql`(working_copy_recipe_id IS NOT NULL AND release_id IS NULL) OR (working_copy_recipe_id IS NULL AND release_id IS NOT NULL)`,
    ),
  ],
)

export type RecipeEdge = typeof RecipeEdgeTable.$inferSelect

export const RecipeExecutionTable = pgTable(
  "recipe_execution",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => RecipeTable.id, { onDelete: "cascade" }),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => RecipeReleaseTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => EnvironmentTable.id, { onDelete: "cascade" }),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    currentStepKey: text("current_step_key"),
    pendingInputConfig: jsonb("pending_input_config").$type<PendingInputConfig>(),
    results: jsonb("results").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("waiting_input"),
    abortedAt: timestamp("aborted_at", { withTimezone: true }),
    abortedBy: uuid("aborted_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("recipe_execution_recipe_idx").on(table.recipeId),
    index("recipe_execution_org_idx").on(table.organizationId),
  ],
)

export type RecipeExecution = typeof RecipeExecutionTable.$inferSelect
