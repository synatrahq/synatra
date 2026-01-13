import { pgTable, pgEnum, uniqueIndex, uuid, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { UserTable } from "./user.sql"
import { OrganizationTable } from "./organization.sql"
import { memberRoleEnum } from "./member.sql"
import { InvitationStatus } from "../types"

export const invitationStatusEnum = pgEnum("invitation_status", InvitationStatus)

export const InvitationTable = pgTable(
  "invitation",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("invitation_email_org_pending_unique")
      .on(table.email, table.organizationId)
      .where(sql`status = 'pending'`),
  ],
)

export type Invitation = typeof InvitationTable.$inferSelect
