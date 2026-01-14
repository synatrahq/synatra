import { pgTable, uuid, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { UserTable } from "./user.sql"

export const EnvironmentTable = pgTable(
  "environment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .references(() => OrganizationTable.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color: text("color"),
    protected: boolean("protected").notNull().default(false),

    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("environment_org_slug_idx").on(table.organizationId, table.slug)],
)

export type Environment = typeof EnvironmentTable.$inferSelect
