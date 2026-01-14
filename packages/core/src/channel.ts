import { z } from "zod"
import { eq, and, count, getTableColumns } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import { createError } from "@synatra/util/error"
import { generateSlug } from "@synatra/util/identifier"
import { getCurrentChannelMember, isOrgAdminOrOwnerChannelMember } from "./channel-member"
import { ChannelTable } from "./schema/channel.sql"
import { ChannelMemberTable } from "./schema/channel-member.sql"
import { MemberTable } from "./schema/member.sql"
import { ThreadTable } from "./schema/thread.sql"
import { ChannelIconColors } from "./types"

export const ListChannelsSchema = z
  .object({
    includeArchived: z.boolean().optional(),
  })
  .optional()

export const CreateChannelSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.enum(ChannelIconColors).optional(),
})

export const CreateManyChannelsSchema = z.array(
  z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    iconColor: z.enum(ChannelIconColors).optional(),
    isDefault: z.boolean().optional(),
    organizationId: z.string(),
    createdBy: z.string(),
  }),
)

export const UpdateChannelSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  icon: z.string().optional(),
  iconColor: z.enum(ChannelIconColors).optional(),
})

export const FindChannelByIdWithAccessSchema = z.object({ channelId: z.string() })

export async function listChannels(input?: z.input<typeof ListChannelsSchema>) {
  const filters = ListChannelsSchema.parse(input)
  const organizationId = principal.orgId()
  const member = await getCurrentChannelMember()

  if (isOrgAdminOrOwnerChannelMember(member?.role)) {
    const conditions = [eq(ChannelTable.organizationId, organizationId)]
    if (!filters?.includeArchived) {
      conditions.push(eq(ChannelTable.archived, false))
    }
    return withDb((db) =>
      db
        .select()
        .from(ChannelTable)
        .where(and(...conditions))
        .orderBy(ChannelTable.createdAt),
    )
  }

  if (!member) return []

  const conditions = [eq(ChannelTable.organizationId, organizationId), eq(ChannelMemberTable.memberId, member.id)]
  if (!filters?.includeArchived) {
    conditions.push(eq(ChannelTable.archived, false))
  }

  return withDb((db) =>
    db
      .select(getTableColumns(ChannelTable))
      .from(ChannelTable)
      .innerJoin(ChannelMemberTable, eq(ChannelTable.id, ChannelMemberTable.channelId))
      .where(and(...conditions))
      .orderBy(ChannelTable.createdAt),
  )
}

export async function findChannelById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(ChannelTable)
      .where(and(eq(ChannelTable.id, id), eq(ChannelTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function getChannelById(id: string) {
  const channel = await findChannelById(id)
  if (!channel) throw createError("NotFoundError", { type: "Channel", id })
  return channel
}

export async function findChannelBySlug(slug: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(ChannelTable)
      .where(and(eq(ChannelTable.organizationId, organizationId), eq(ChannelTable.slug, slug)))
      .then(first),
  )
}

export async function findDefaultChannel(organizationId: string) {
  return withDb((db) =>
    db
      .select()
      .from(ChannelTable)
      .where(and(eq(ChannelTable.organizationId, organizationId), eq(ChannelTable.isDefault, true)))
      .then(first),
  )
}

export async function findDefaultChannels(organizationId: string) {
  return withDb((db) =>
    db
      .select()
      .from(ChannelTable)
      .where(and(eq(ChannelTable.organizationId, organizationId), eq(ChannelTable.isDefault, true))),
  )
}

export async function createChannel(input: z.input<typeof CreateChannelSchema>) {
  const data = CreateChannelSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const slug = data.slug?.trim() || generateSlug(data.name)

  return withTx(async (tx) => {
    const [channel] = await tx
      .insert(ChannelTable)
      .values({
        organizationId,
        name: data.name,
        slug,
        description: data.description ?? null,
        icon: data.icon ?? "Hash",
        iconColor: data.iconColor ?? "gray",
        isDefault: false,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    const member = await tx
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.userId, userId), eq(MemberTable.organizationId, organizationId)))
      .then(first)

    if (member) {
      await tx.insert(ChannelMemberTable).values({
        channelId: channel.id,
        memberId: member.id,
        role: "owner",
        createdBy: userId,
      })
    }

    return channel
  })
}

export async function createManyChannels(input: z.input<typeof CreateManyChannelsSchema>) {
  const data = CreateManyChannelsSchema.parse(input)
  if (data.length === 0) return []

  return withTx(async (tx) => {
    const values = data.map((input) => ({
      organizationId: input.organizationId,
      name: input.name,
      slug: input.slug?.trim() || generateSlug(input.name),
      description: input.description ?? null,
      icon: input.icon ?? "Hash",
      iconColor: input.iconColor ?? "gray",
      isDefault: input.isDefault ?? false,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    }))

    const channels = await tx.insert(ChannelTable).values(values).returning()

    const creatorIds = [...new Set(data.map((input) => ({ orgId: input.organizationId, userId: input.createdBy })))]
    const members = await tx
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.organizationId, creatorIds[0].orgId), eq(MemberTable.userId, creatorIds[0].userId)))

    if (members.length > 0) {
      const member = members[0]
      const channelMemberValues = channels.map((channel) => ({
        channelId: channel.id,
        memberId: member.id,
        role: "owner" as const,
        createdBy: member.userId,
      }))
      await tx.insert(ChannelMemberTable).values(channelMemberValues)
    }

    return channels
  })
}

export async function updateChannel(input: z.input<typeof UpdateChannelSchema>) {
  const data = UpdateChannelSchema.parse(input)
  await getChannelById(data.id)
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: principal.userId(),
  }

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.description !== undefined) updateData.description = data.description
  if (data.icon !== undefined) updateData.icon = data.icon
  if (data.iconColor !== undefined) updateData.iconColor = data.iconColor

  const [channel] = await withDb((db) =>
    db.update(ChannelTable).set(updateData).where(eq(ChannelTable.id, data.id)).returning(),
  )

  return channel
}

export async function archiveChannel(id: string) {
  const channel = await getChannelById(id)
  if (channel.isDefault) {
    throw createError("BadRequestError", { message: "Default channel cannot be archived" })
  }

  const [updated] = await withDb((db) =>
    db
      .update(ChannelTable)
      .set({ archived: true, updatedAt: new Date(), updatedBy: principal.userId() })
      .where(eq(ChannelTable.id, id))
      .returning(),
  )

  return updated
}

export async function unarchiveChannel(id: string) {
  await getChannelById(id)
  const [channel] = await withDb((db) =>
    db
      .update(ChannelTable)
      .set({ archived: false, updatedAt: new Date(), updatedBy: principal.userId() })
      .where(eq(ChannelTable.id, id))
      .returning(),
  )

  return channel
}

export async function removeChannel(id: string) {
  const channel = await getChannelById(id)
  if (channel.isDefault) {
    throw createError("BadRequestError", { message: "Default channel cannot be deleted" })
  }

  const [deleted] = await withDb((db) =>
    db.delete(ChannelTable).where(eq(ChannelTable.id, id)).returning({ id: ChannelTable.id }),
  )

  return deleted
}

export async function countChannels() {
  const organizationId = principal.orgId()
  const member = await getCurrentChannelMember()

  if (isOrgAdminOrOwnerChannelMember(member?.role)) {
    const results = await withDb((db) =>
      db
        .select({
          channelId: ChannelTable.id,
          channelName: ChannelTable.name,
          channelSlug: ChannelTable.slug,
          channelIcon: ChannelTable.icon,
          channelIconColor: ChannelTable.iconColor,
          channelIsDefault: ChannelTable.isDefault,
          channelArchived: ChannelTable.archived,
          count: count(),
        })
        .from(ChannelTable)
        .leftJoin(ThreadTable, eq(ChannelTable.id, ThreadTable.channelId))
        .where(and(eq(ChannelTable.organizationId, organizationId), eq(ChannelTable.archived, false)))
        .groupBy(
          ChannelTable.id,
          ChannelTable.name,
          ChannelTable.slug,
          ChannelTable.icon,
          ChannelTable.iconColor,
          ChannelTable.isDefault,
          ChannelTable.archived,
        ),
    )

    return results.map((row) => ({
      id: row.channelId,
      name: row.channelName,
      slug: row.channelSlug,
      icon: row.channelIcon,
      iconColor: row.channelIconColor,
      isDefault: row.channelIsDefault,
      count: row.count,
    }))
  }

  if (!member) return []

  const results = await withDb((db) =>
    db
      .select({
        channelId: ChannelTable.id,
        channelName: ChannelTable.name,
        channelSlug: ChannelTable.slug,
        channelIcon: ChannelTable.icon,
        channelIconColor: ChannelTable.iconColor,
        channelIsDefault: ChannelTable.isDefault,
        channelArchived: ChannelTable.archived,
        count: count(),
      })
      .from(ChannelTable)
      .innerJoin(ChannelMemberTable, eq(ChannelTable.id, ChannelMemberTable.channelId))
      .leftJoin(ThreadTable, eq(ChannelTable.id, ThreadTable.channelId))
      .where(
        and(
          eq(ChannelTable.organizationId, organizationId),
          eq(ChannelTable.archived, false),
          eq(ChannelMemberTable.memberId, member.id),
        ),
      )
      .groupBy(
        ChannelTable.id,
        ChannelTable.name,
        ChannelTable.slug,
        ChannelTable.icon,
        ChannelTable.iconColor,
        ChannelTable.isDefault,
        ChannelTable.archived,
      ),
  )

  return results.map((row) => ({
    id: row.channelId,
    name: row.channelName,
    slug: row.channelSlug,
    icon: row.channelIcon,
    iconColor: row.channelIconColor,
    isDefault: row.channelIsDefault,
    count: row.count,
  }))
}

export async function findChannelByIdWithAccess(input: z.input<typeof FindChannelByIdWithAccessSchema>) {
  const data = FindChannelByIdWithAccessSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()

  return withDb(async (db) => {
    const result = await db
      .select({
        channel: ChannelTable,
        member: MemberTable,
        channelMember: ChannelMemberTable,
      })
      .from(ChannelTable)
      .leftJoin(
        MemberTable,
        and(eq(MemberTable.organizationId, ChannelTable.organizationId), eq(MemberTable.userId, userId)),
      )
      .leftJoin(
        ChannelMemberTable,
        and(eq(ChannelMemberTable.channelId, ChannelTable.id), eq(ChannelMemberTable.memberId, MemberTable.id)),
      )
      .where(and(eq(ChannelTable.id, data.channelId), eq(ChannelTable.organizationId, organizationId)))
      .then(first)

    if (!result?.channel) {
      return null
    }

    return {
      channel: result.channel,
      member: result.member,
      channelMember: result.channelMember,
      hasAccess: result.channel.isDefault || !!result.channelMember,
    }
  })
}
