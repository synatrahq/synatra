import { pgTable, uuid, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"

export const UsageMonthTable = pgTable(
  "usage_month",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    yearMonth: integer("year_month").notNull(),
    runCount: integer("run_count").notNull().default(0),
    runsUser: integer("runs_user").notNull().default(0),
    runsTrigger: integer("runs_trigger").notNull().default(0),
    runsSubagent: integer("runs_subagent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("usage_month_org_ym_idx").on(t.organizationId, t.yearMonth)],
)

export type UsageMonth = typeof UsageMonthTable.$inferSelect
