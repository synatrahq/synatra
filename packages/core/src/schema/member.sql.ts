import { pgTable, pgEnum, uniqueIndex, uuid, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { UserTable } from "./user.sql"
import { OrganizationTable } from "./organization.sql"
import { MemberRole } from "../types"

export const memberRoleEnum = pgEnum("member_role", MemberRole)

export const MemberTable = pgTable(
  "member",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("member_user_org_unique").on(table.userId, table.organizationId)],
)

export type Member = typeof MemberTable.$inferSelect
