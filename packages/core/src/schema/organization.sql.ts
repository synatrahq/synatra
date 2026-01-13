import { pgTable, uniqueIndex, uuid, timestamp, text } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { UserTable } from "./user.sql"

export const OrganizationTable = pgTable(
  "organization",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organization_slug_unique").on(table.slug)],
)

export type Organization = typeof OrganizationTable.$inferSelect
