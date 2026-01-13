import { z } from "zod"
import { eq, and, count } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, first } from "./database"
import { createError } from "@synatra/util/error"
import { ChannelTable } from "./schema/channel.sql"
import { ChannelMemberTable } from "./schema/channel-member.sql"
import { MemberTable } from "./schema/member.sql"
import { UserTable } from "./schema/user.sql"
import { ChannelMemberRole } from "./types"

export const AddChannelMemberSchema = z.object({
  channelId: z.string(),
  memberIds: z.array(z.string()).min(1),
})

export const RemoveChannelMemberSchema = z.object({
  channelId: z.string(),
  memberId: z.string(),
})

export const HasAccessChannelMemberSchema = z.object({
  channelId: z.string(),
  memberId: z.string(),
})

export const UpdateChannelMemberRoleSchema = z.object({
  channelId: z.string(),
  memberId: z.string(),
  role: z.enum(ChannelMemberRole),
})

export const FindChannelMemberByChannelAndMemberSchema = z.object({
  channelId: z.string(),
  memberId: z.string(),
})

export const AddChannelMemberToDefaultsSchema = z.object({
  memberId: z.string(),
  channelIds: z.array(z.string()),
  createdBy: z.string(),
})

export async function getCurrentChannelMember() {
  const organizationId = principal.orgId()
  const userId = principal.userId()
  return withDb((db) =>
    db
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.userId, userId), eq(MemberTable.organizationId, organizationId)))
      .then(first),
  )
}

export function isOrgAdminOrOwnerChannelMember(role?: string): boolean {
  return role === "owner" || role === "admin"
}

export async function addChannelMember(input: z.input<typeof AddChannelMemberSchema>) {
  const data = AddChannelMemberSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()

  const channel = await withDb((db) =>
    db.select().from(ChannelTable).where(eq(ChannelTable.id, data.channelId)).then(first),
  )

  if (!channel || channel.organizationId !== organizationId) {
    throw createError("ForbiddenError", { message: "Channel not found" })
  }

  const members = await withDb((db) =>
    db.select().from(MemberTable).where(eq(MemberTable.organizationId, organizationId)),
  )

  const validMemberIds = new Set(members.map((m) => m.id))
  const toAdd = data.memberIds.filter((id) => validMemberIds.has(id))

  if (toAdd.length === 0) return []

  return withDb((db) =>
    db
      .insert(ChannelMemberTable)
      .values(
        toAdd.map((memberId) => ({
          channelId: data.channelId,
          memberId,
          role: "member" as const,
          createdBy: userId,
        })),
      )
      .onConflictDoNothing()
      .returning(),
  )
}

export async function removeChannelMember(input: z.input<typeof RemoveChannelMemberSchema>) {
  const data = RemoveChannelMemberSchema.parse(input)
  const current = await withDb((db) =>
    db
      .select()
      .from(ChannelMemberTable)
      .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.memberId, data.memberId)))
      .then(first),
  )

  if (current?.role === "owner") {
    const ownerCount = await withDb((db) =>
      db
        .select({ count: count() })
        .from(ChannelMemberTable)
        .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.role, "owner")))
        .then((rows) => rows[0]?.count ?? 0),
    )
    if (ownerCount <= 1) {
      throw createError("BadRequestError", { message: "Cannot remove the last owner" })
    }
  }

  return withDb((db) =>
    db
      .delete(ChannelMemberTable)
      .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.memberId, data.memberId)))
      .returning({ id: ChannelMemberTable.id }),
  ).then(first)
}

export async function listChannelMembersByChannel(channelId: string) {
  return withDb((db) =>
    db
      .select({
        id: ChannelMemberTable.id,
        channelId: ChannelMemberTable.channelId,
        memberId: ChannelMemberTable.memberId,
        role: ChannelMemberTable.role,
        createdAt: ChannelMemberTable.createdAt,
        member: {
          id: MemberTable.id,
          userId: MemberTable.userId,
          role: MemberTable.role,
        },
        user: {
          id: UserTable.id,
          name: UserTable.name,
          email: UserTable.email,
          image: UserTable.image,
        },
      })
      .from(ChannelMemberTable)
      .innerJoin(MemberTable, eq(ChannelMemberTable.memberId, MemberTable.id))
      .innerJoin(UserTable, eq(MemberTable.userId, UserTable.id))
      .where(eq(ChannelMemberTable.channelId, channelId)),
  )
}

export async function listChannelMembersByMember(memberId: string) {
  return withDb((db) => db.select().from(ChannelMemberTable).where(eq(ChannelMemberTable.memberId, memberId)))
}

export async function hasAccessChannelMember(input: z.input<typeof HasAccessChannelMemberSchema>) {
  const data = HasAccessChannelMemberSchema.parse(input)
  const result = await withDb((db) =>
    db
      .select({ id: ChannelMemberTable.id })
      .from(ChannelMemberTable)
      .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.memberId, data.memberId)))
      .then(first),
  )
  return !!result
}

export async function updateChannelMemberRole(input: z.input<typeof UpdateChannelMemberRoleSchema>) {
  const data = UpdateChannelMemberRoleSchema.parse(input)
  const current = await withDb((db) =>
    db
      .select()
      .from(ChannelMemberTable)
      .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.memberId, data.memberId)))
      .then(first),
  )

  if (current?.role === "owner" && data.role !== "owner") {
    const ownerCount = await withDb((db) =>
      db
        .select({ count: count() })
        .from(ChannelMemberTable)
        .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.role, "owner")))
        .then((rows) => rows[0]?.count ?? 0),
    )
    if (ownerCount <= 1) {
      throw createError("BadRequestError", { message: "Cannot demote the last owner" })
    }
  }

  const [updated] = await withDb((db) =>
    db
      .update(ChannelMemberTable)
      .set({ role: data.role })
      .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.memberId, data.memberId)))
      .returning(),
  )

  return updated
}

export async function findChannelMemberById(id: string) {
  return withDb((db) => db.select().from(ChannelMemberTable).where(eq(ChannelMemberTable.id, id)).then(first))
}

export async function findChannelMemberByChannelAndMember(
  input: z.input<typeof FindChannelMemberByChannelAndMemberSchema>,
) {
  const data = FindChannelMemberByChannelAndMemberSchema.parse(input)
  return withDb((db) =>
    db
      .select()
      .from(ChannelMemberTable)
      .where(and(eq(ChannelMemberTable.channelId, data.channelId), eq(ChannelMemberTable.memberId, data.memberId)))
      .then(first),
  )
}

export async function addChannelMemberToDefaults(input: z.input<typeof AddChannelMemberToDefaultsSchema>) {
  const data = AddChannelMemberToDefaultsSchema.parse(input)
  if (data.channelIds.length === 0) return []
  return withDb((db) =>
    db
      .insert(ChannelMemberTable)
      .values(
        data.channelIds.map((channelId) => ({
          channelId,
          memberId: data.memberId,
          role: "member" as const,
          createdBy: data.createdBy,
        })),
      )
      .onConflictDoNothing()
      .returning(),
  )
}

export async function canAccessCurrentUserChannelMember(channelId: string) {
  const organizationId = principal.orgId()

  const channel = await withDb((db) => db.select().from(ChannelTable).where(eq(ChannelTable.id, channelId)).then(first))

  if (!channel || channel.organizationId !== organizationId) return false

  const member = await getCurrentChannelMember()
  if (!member) return false
  if (isOrgAdminOrOwnerChannelMember(member.role)) return true
  return hasAccessChannelMember({ channelId, memberId: member.id })
}
