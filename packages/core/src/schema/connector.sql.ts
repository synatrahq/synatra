import { pgTable, pgEnum, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { UserTable } from "./user.sql"
import type { ConnectorMetadata } from "../types"

export const ConnectorStatus = ["online", "offline", "error"] as const
export type ConnectorStatus = (typeof ConnectorStatus)[number]

export const connectorStatusEnum = pgEnum("connector_status", ConnectorStatus)

export const ConnectorTable = pgTable(
  "connector",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .references(() => OrganizationTable.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: connectorStatusEnum("status").default("offline").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<ConnectorMetadata>(),

    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("connector_org_name_idx").on(table.organizationId, table.name)],
)

export type Connector = typeof ConnectorTable.$inferSelect
