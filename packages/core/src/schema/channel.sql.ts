import { pgTable, text, timestamp, uuid, boolean, uniqueIndex, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"
import { UserTable } from "./user.sql"

export const ChannelTable = pgTable(
  "channel",
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
    icon: text("icon").default("Hash").notNull(),
    iconColor: text("icon_color").default("gray").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("channel_org_slug_idx").on(table.organizationId, table.slug),
    index("channel_org_idx").on(table.organizationId, table.isArchived, table.createdAt),
  ],
)

export type Channel = typeof ChannelTable.$inferSelect
