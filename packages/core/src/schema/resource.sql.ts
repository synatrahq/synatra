import { pgTable, pgEnum, uuid, text, jsonb, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { EnvironmentTable } from "./environment.sql"
import { UserTable } from "./user.sql"
import { ConnectorTable } from "./connector.sql"
import { ResourceType, ConnectionMode, type StoredResourceConfig } from "../types"

export const resourceTypeEnum = pgEnum("resource_type", ResourceType)
export const connectionModeEnum = pgEnum("connection_mode", ConnectionMode)

export const ResourceTable = pgTable(
  "resource",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .references(() => OrganizationTable.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    type: resourceTypeEnum("type").notNull(),
    managed: boolean("managed").default(false).notNull(),

    createdBy: uuid("created_by")
      .references(() => UserTable.id, { onDelete: "restrict" })
      .notNull(),
    updatedBy: uuid("updated_by")
      .references(() => UserTable.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("resource_org_slug_idx").on(table.organizationId, table.slug)],
)

export const ResourceConfigTable = pgTable(
  "resource_config",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    resourceId: uuid("resource_id")
      .references(() => ResourceTable.id, { onDelete: "cascade" })
      .notNull(),
    environmentId: uuid("environment_id")
      .references(() => EnvironmentTable.id, { onDelete: "cascade" })
      .notNull(),

    config: jsonb("config").$type<StoredResourceConfig>().notNull(),
    connectionMode: connectionModeEnum("connection_mode").default("direct").notNull(),
    connectorId: uuid("connector_id").references(() => ConnectorTable.id, { onDelete: "set null" }),

    createdBy: uuid("created_by")
      .references(() => UserTable.id, { onDelete: "restrict" })
      .notNull(),
    updatedBy: uuid("updated_by")
      .references(() => UserTable.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("resource_config_resource_env_idx").on(table.resourceId, table.environmentId)],
)

export type Resource = typeof ResourceTable.$inferSelect
export type ResourceConfig = typeof ResourceConfigTable.$inferSelect
