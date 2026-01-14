import { pgTable, uniqueIndex, uuid, timestamp, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ChannelTable } from "./channel.sql"
import { AgentTable } from "./agent.sql"
import { UserTable } from "./user.sql"

export const ChannelAgentTable = pgTable(
  "channel_agent",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => ChannelTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("channel_agent_unique").on(table.channelId, table.agentId),
    index("channel_agent_channel_idx").on(table.channelId),
    index("channel_agent_agent_idx").on(table.agentId),
  ],
)

export type ChannelAgent = typeof ChannelAgentTable.$inferSelect
