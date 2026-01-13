import { pgTable, uuid, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"

export const StripeEventTable = pgTable(
  "stripe_event",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    organizationId: uuid("organization_id").references(() => OrganizationTable.id, { onDelete: "cascade" }),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("stripe_event_id_idx").on(table.stripeEventId)],
)

export type StripeEvent = typeof StripeEventTable.$inferSelect
