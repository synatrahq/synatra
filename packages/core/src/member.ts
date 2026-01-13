import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { principal } from "./principal"
import { withDb } from "./database"
import { MemberTable } from "./schema/member.sql"

export const ListMembersSchema = z.void()

export const FindMemberByUserAndOrgSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
})

export const RemoveMemberSchema = z.string()

export const GetMemberRoleSchema = z.void()

export const IsOwnerMemberSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
})

export const FindOwnerMemberSchema = z.object({
  organizationId: z.string(),
})

export async function listMembers(input?: z.input<typeof ListMembersSchema>) {
  ListMembersSchema.parse(input)
  const organizationId = principal.orgId()
  return withDb((db) => db.select().from(MemberTable).where(eq(MemberTable.organizationId, organizationId)))
}

export async function findMemberByUserAndOrg(input: z.input<typeof FindMemberByUserAndOrgSchema>) {
  const data = FindMemberByUserAndOrgSchema.parse(input)
  const [member] = await withDb((db) =>
    db
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.userId, data.userId), eq(MemberTable.organizationId, data.organizationId))),
  )
  return member
}

export async function removeMember(input: z.input<typeof RemoveMemberSchema>) {
  const userId = RemoveMemberSchema.parse(input)
  const organizationId = principal.orgId()
  const [deleted] = await withDb((db) =>
    db
      .delete(MemberTable)
      .where(and(eq(MemberTable.userId, userId), eq(MemberTable.organizationId, organizationId)))
      .returning({ id: MemberTable.id }),
  )
  return deleted
}

export async function getMemberRole(input?: z.input<typeof GetMemberRoleSchema>) {
  GetMemberRoleSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const [member] = await withDb((db) =>
    db
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.userId, userId), eq(MemberTable.organizationId, organizationId))),
  )
  return member?.role ?? null
}

export async function isOwnerMember(input: z.input<typeof IsOwnerMemberSchema>) {
  const data = IsOwnerMemberSchema.parse(input)
  const member = await findMemberByUserAndOrg({ userId: data.userId, organizationId: data.organizationId })
  return member?.role === "owner"
}

export async function findOwnerMember(input: z.input<typeof FindOwnerMemberSchema>) {
  const data = FindOwnerMemberSchema.parse(input)
  const [member] = await withDb((db) =>
    db
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.organizationId, data.organizationId), eq(MemberTable.role, "owner")))
      .limit(1),
  )
  return member
}
