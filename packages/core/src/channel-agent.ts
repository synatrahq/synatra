import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, first } from "./database"
import { createError } from "@synatra/util/error"
import { ChannelTable } from "./schema/channel.sql"
import { ChannelAgentTable } from "./schema/channel-agent.sql"
import { AgentTable } from "./schema/agent.sql"

export const AddChannelAgentSchema = z.object({
  channelId: z.string(),
  agentIds: z.array(z.string()).min(1),
})

export const RemoveChannelAgentSchema = z.object({
  channelId: z.string(),
  agentId: z.string(),
})

export const IsAssignedChannelAgentSchema = z.object({
  channelId: z.string(),
  agentId: z.string(),
})

export async function addChannelAgent(input: z.input<typeof AddChannelAgentSchema>) {
  const data = AddChannelAgentSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()

  const channel = await withDb((db) =>
    db.select().from(ChannelTable).where(eq(ChannelTable.id, data.channelId)).then(first),
  )

  if (!channel || channel.organizationId !== organizationId) {
    throw createError("ForbiddenError", { message: "Channel not found" })
  }

  const agents = await withDb((db) => db.select().from(AgentTable).where(eq(AgentTable.organizationId, organizationId)))

  const validAgentIds = new Set(agents.map((a) => a.id))
  const toAdd = data.agentIds.filter((id) => validAgentIds.has(id))

  if (toAdd.length === 0) return []

  return withDb((db) =>
    db
      .insert(ChannelAgentTable)
      .values(
        toAdd.map((agentId) => ({
          channelId: data.channelId,
          agentId,
          createdBy: userId,
        })),
      )
      .onConflictDoNothing()
      .returning(),
  )
}

export async function removeChannelAgent(input: z.input<typeof RemoveChannelAgentSchema>) {
  const data = RemoveChannelAgentSchema.parse(input)
  const organizationId = principal.orgId()

  const channel = await withDb((db) =>
    db.select().from(ChannelTable).where(eq(ChannelTable.id, data.channelId)).then(first),
  )
  if (!channel || channel.organizationId !== organizationId) {
    throw createError("ForbiddenError", { message: "Channel not found" })
  }

  return withDb((db) =>
    db
      .delete(ChannelAgentTable)
      .where(and(eq(ChannelAgentTable.channelId, data.channelId), eq(ChannelAgentTable.agentId, data.agentId)))
      .returning({ id: ChannelAgentTable.id }),
  ).then(first)
}

export async function listChannelAgentsByChannel(channelId: string) {
  return withDb((db) =>
    db
      .select({
        id: ChannelAgentTable.id,
        channelId: ChannelAgentTable.channelId,
        agentId: ChannelAgentTable.agentId,
        createdAt: ChannelAgentTable.createdAt,
        agent: {
          id: AgentTable.id,
          name: AgentTable.name,
          slug: AgentTable.slug,
          icon: AgentTable.icon,
          iconColor: AgentTable.iconColor,
        },
      })
      .from(ChannelAgentTable)
      .innerJoin(AgentTable, eq(ChannelAgentTable.agentId, AgentTable.id))
      .where(eq(ChannelAgentTable.channelId, channelId)),
  )
}

export async function listChannelAgentsByAgent(agentId: string) {
  return withDb((db) => db.select().from(ChannelAgentTable).where(eq(ChannelAgentTable.agentId, agentId)))
}

export async function isAssignedChannelAgent(input: z.input<typeof IsAssignedChannelAgentSchema>) {
  const data = IsAssignedChannelAgentSchema.parse(input)
  const result = await withDb((db) =>
    db
      .select({ id: ChannelAgentTable.id })
      .from(ChannelAgentTable)
      .where(and(eq(ChannelAgentTable.channelId, data.channelId), eq(ChannelAgentTable.agentId, data.agentId)))
      .then(first),
  )
  return !!result
}

export async function findChannelAgentById(id: string) {
  return withDb((db) => db.select().from(ChannelAgentTable).where(eq(ChannelAgentTable.id, id)).then(first))
}
