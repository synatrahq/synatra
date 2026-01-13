import { pgTable, uuid, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { OrganizationTable } from "./organization.sql"

export const UsagePeriodTable = pgTable(
  "usage_period",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    runCount: integer("run_count").notNull().default(0),
    runLimit: integer("run_limit"),
    runsUser: integer("runs_user").notNull().default(0),
    runsTrigger: integer("runs_trigger").notNull().default(0),
    runsSubagent: integer("runs_subagent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("usage_period_org_period_idx").on(table.organizationId, table.periodStart)],
)

export type UsagePeriod = typeof UsagePeriodTable.$inferSelect
