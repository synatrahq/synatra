import { z } from "zod"
import { eq } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, first } from "./database"
import { OrganizationTable } from "./schema/organization.sql"
import { SubscriptionTable } from "./schema/subscription.sql"

export const FindOrganizationByStripeCustomerIdSchema = z.object({
  stripeCustomerId: z.string(),
})

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  logo: z.string().optional(),
})

export async function findOrganizationById(id: string) {
  return withDb((db) => db.select().from(OrganizationTable).where(eq(OrganizationTable.id, id)).then(first))
}

export async function findOrganizationBySlug(slug: string) {
  return withDb((db) => db.select().from(OrganizationTable).where(eq(OrganizationTable.slug, slug)).then(first))
}

export async function findOrganizationByStripeCustomerId(
  input: z.input<typeof FindOrganizationByStripeCustomerIdSchema>,
) {
  const data = FindOrganizationByStripeCustomerIdSchema.parse(input)
  const [sub] = await withDb((db) =>
    db.select().from(SubscriptionTable).where(eq(SubscriptionTable.stripeCustomerId, data.stripeCustomerId)).limit(1),
  )

  return sub ? findOrganizationById(sub.organizationId) : null
}

export async function updateOrganization(input: z.input<typeof UpdateOrganizationSchema>) {
  const data = UpdateOrganizationSchema.parse(input)
  const organizationId = principal.orgId()

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }
  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.logo !== undefined) updateData.logo = data.logo

  const [organization] = await withDb((db) =>
    db.update(OrganizationTable).set(updateData).where(eq(OrganizationTable.id, organizationId)).returning(),
  )

  return organization
}
