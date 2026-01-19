import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { createError } from "@synatra/util/error"
import { principal } from "./principal"
import { withDb, withTx } from "./database"
import { OrganizationTable } from "./schema/organization.sql"
import { InvitationTable } from "./schema/invitation.sql"
import { MemberRole } from "./types"
import { checkUserLimit } from "./plan"
import { findOrganizationById } from "./organization"

export const ListInvitationsSchema = z.void()

export const CreateInvitationSchema = z.object({
  email: z.email(),
  role: z.enum(MemberRole).default("member"),
  expiresAt: z.date(),
})

export const GetInvitationEmailDataSchema = z.object({
  invitationIds: z.array(z.string()).min(1),
})

export const CreateManyInvitationsSchema = z.object({
  emails: z.array(z.email()).min(1).max(50),
  role: z.enum(MemberRole).default("member"),
})

export const RemoveInvitationSchema = z.string()

export async function listInvitations(input?: z.input<typeof ListInvitationsSchema>) {
  ListInvitationsSchema.parse(input)
  const organizationId = principal.orgId()
  return withDb((db) => db.select().from(InvitationTable).where(eq(InvitationTable.organizationId, organizationId)))
}

export async function createInvitation(input: z.input<typeof CreateInvitationSchema>) {
  const data = CreateInvitationSchema.parse(input)
  const organizationId = principal.orgId()
  const inviterId = principal.userId()

  try {
    return await withTx(async (tx) => {
      await tx.select().from(OrganizationTable).where(eq(OrganizationTable.id, organizationId)).for("update")

      await checkUserLimit(1)

      const [invitation] = await tx
        .insert(InvitationTable)
        .values({
          email: data.email,
          organizationId,
          inviterId,
          role: data.role,
          expiresAt: data.expiresAt,
        })
        .returning()

      return invitation
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes("invitation_email_org_pending_unique")) {
      throw createError("ConflictError", { message: `Pending invitation for "${data.email}" already exists` })
    }
    throw err
  }
}

export async function getInvitationEmailData(input: z.input<typeof GetInvitationEmailDataSchema>) {
  const data = GetInvitationEmailDataSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const [org, user, invitations] = await Promise.all([
    findOrganizationById(organizationId),
    withDb((db) => db.query.user.findFirst({ where: (t, { eq }) => eq(t.id, userId) })),
    withDb((db) =>
      db
        .select()
        .from(InvitationTable)
        .where(and(eq(InvitationTable.organizationId, organizationId))),
    ),
  ])

  if (!org) throw new Error("Organization not found")
  if (!user) throw new Error("User not found")

  const requestedInvitations = invitations.filter((inv) => data.invitationIds.includes(inv.id))

  return {
    organization: { id: org.id, name: org.name },
    inviter: { id: user.id, name: user.name || user.email, email: user.email },
    invitations: requestedInvitations.map((inv) => ({ id: inv.id, email: inv.email })),
  }
}

export async function createManyInvitations(input: z.input<typeof CreateManyInvitationsSchema>) {
  const data = CreateManyInvitationsSchema.parse(input)
  const organizationId = principal.orgId()
  const inviterId = principal.userId()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

  return withTx(async (tx) => {
    await tx.select().from(OrganizationTable).where(eq(OrganizationTable.id, organizationId)).for("update")

    await checkUserLimit(data.emails.length)

    return tx
      .insert(InvitationTable)
      .values(
        data.emails.map((email) => ({
          email,
          organizationId,
          inviterId,
          role: data.role,
          expiresAt,
        })),
      )
      .returning()
  })
}

export async function removeInvitation(input: z.input<typeof RemoveInvitationSchema>) {
  const id = RemoveInvitationSchema.parse(input)
  const [deleted] = await withDb((db) =>
    db.delete(InvitationTable).where(eq(InvitationTable.id, id)).returning({ id: InvitationTable.id }),
  )
  return deleted
}
