import { pgTable, pgEnum, uniqueIndex, uuid, timestamp, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ChannelTable } from "./channel.sql"
import { MemberTable } from "./member.sql"
import { UserTable } from "./user.sql"
import { ChannelMemberRole } from "../types"

export const channelMemberRoleEnum = pgEnum("channel_member_role", ChannelMemberRole)

export const ChannelMemberTable = pgTable(
  "channel_member",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => ChannelTable.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => MemberTable.id, { onDelete: "cascade" }),
    role: channelMemberRoleEnum("role").notNull().default("member"),
    createdBy: uuid("created_by")
      .references(() => UserTable.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("channel_member_unique").on(table.channelId, table.memberId),
    index("channel_member_channel_idx").on(table.channelId),
    index("channel_member_member_idx").on(table.memberId),
  ],
)

export type ChannelMember = typeof ChannelMemberTable.$inferSelect
