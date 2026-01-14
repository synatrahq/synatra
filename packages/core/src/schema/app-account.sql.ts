import { pgTable, pgEnum, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { UserTable } from "./user.sql"
import { AppId, type AppAccountCredentials, type AppAccountMetadata } from "../types"

export const appIdEnum = pgEnum("app_id", AppId)

export const AppAccountTable = pgTable(
  "app_account",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .references(() => OrganizationTable.id, { onDelete: "cascade" })
      .notNull(),
    appId: appIdEnum("app_id").notNull(),
    name: text("name").notNull(),
    credentials: jsonb("credentials").$type<AppAccountCredentials>().notNull(),
    metadata: jsonb("metadata").$type<AppAccountMetadata>(),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("app_account_org_name_idx").on(table.organizationId, table.name)],
)

export type AppAccount = typeof AppAccountTable.$inferSelect
