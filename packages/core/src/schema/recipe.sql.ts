import { index, pgEnum, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { EnvironmentTable } from "./environment.sql"
import { ChannelTable } from "./channel.sql"
import { AgentTable } from "./agent.sql"
import { ThreadTable } from "./thread.sql"
import { RunTable } from "./run.sql"
import { UserTable } from "./user.sql"
import { RecipeExecutionStatus } from "../types"
import type { RecipeInput, RecipeStep, RecipeOutput, PendingInputConfig, RecipeExecutionError } from "../types"

export const recipeExecutionStatusEnum = pgEnum("recipe_execution_status", RecipeExecutionStatus)

export const RecipeTable = pgTable(
  "recipe",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => ChannelTable.id, { onDelete: "set null" }),
    sourceThreadId: uuid("source_thread_id").references(() => ThreadTable.id, { onDelete: "set null" }),
    sourceRunId: uuid("source_run_id").references(() => RunTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    inputs: jsonb("inputs").$type<RecipeInput[]>().notNull().default([]),
    steps: jsonb("steps").$type<RecipeStep[]>().notNull().default([]),
    outputs: jsonb("outputs").$type<RecipeOutput[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("recipe_org_idx").on(table.organizationId, table.createdAt),
    index("recipe_org_agent_idx").on(table.organizationId, table.agentId, table.createdAt),
    index("recipe_channel_idx").on(table.channelId, table.createdAt),
  ],
)

export type Recipe = typeof RecipeTable.$inferSelect

export const RecipeExecutionTable = pgTable(
  "recipe_execution",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => RecipeTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => EnvironmentTable.id, { onDelete: "cascade" }),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    status: recipeExecutionStatusEnum("status").notNull().default("pending"),
    currentStepId: text("current_step_id"),
    pendingInputConfig: jsonb("pending_input_config").$type<PendingInputConfig>(),
    results: jsonb("results").$type<Record<string, unknown>>().notNull().default({}),
    resolvedParams: jsonb("resolved_params").$type<Record<string, Record<string, unknown>>>().notNull().default({}),
    outputItemIds: jsonb("output_item_ids").$type<string[]>().notNull().default([]),
    error: jsonb("error").$type<RecipeExecutionError>(),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("recipe_execution_recipe_idx").on(table.recipeId, table.createdAt),
    index("recipe_execution_org_idx").on(table.organizationId, table.createdAt),
    index("recipe_execution_status_idx").on(table.organizationId, table.status, table.createdAt),
  ],
)

export type RecipeExecution = typeof RecipeExecutionTable.$inferSelect
