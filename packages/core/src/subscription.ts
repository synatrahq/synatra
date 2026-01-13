import { eq } from "drizzle-orm"
import { z } from "zod"
import { principal } from "./principal"
import { withDb } from "./database"
import { SubscriptionTable } from "./schema"
import { SubscriptionPlan, SubscriptionStatus, PLAN_HIERARCHY, PLAN_LIMITS } from "./types"
import { config } from "./config"

export function isUpgradeSubscription(current: SubscriptionPlan, next: SubscriptionPlan): boolean {
  return PLAN_HIERARCHY[next] > PLAN_HIERARCHY[current]
}

export function isDowngradeSubscription(current: SubscriptionPlan, next: SubscriptionPlan): boolean {
  return PLAN_HIERARCHY[next] < PLAN_HIERARCHY[current]
}

export function getStripePriceIdSubscription(plan: SubscriptionPlan): string | null {
  if (plan === "free") return null
  const stripe = config().stripe
  if (!stripe) return null
  const prices: Record<string, string | undefined> = {
    starter: stripe.priceStarter,
    pro: stripe.pricePro,
    business: stripe.priceBusiness,
  }
  return prices[plan] ?? null
}

export function getPlanFromPriceIdSubscription(priceId: string): SubscriptionPlan | null {
  const stripe = config().stripe
  if (!stripe) return null

  if (priceId === stripe.priceStarter) return "starter"
  if (priceId === stripe.pricePro) return "pro"
  if (priceId === stripe.priceBusiness) return "business"
  return null
}

export const CurrentSubscriptionSchema = z.object({}).optional()

export async function currentSubscription(input?: z.input<typeof CurrentSubscriptionSchema>) {
  CurrentSubscriptionSchema.parse(input)
  const organizationId = principal.orgId()

  const [existing] = await withDb((db) =>
    db.select().from(SubscriptionTable).where(eq(SubscriptionTable.organizationId, organizationId)).limit(1),
  )
  if (existing) return existing

  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const { runLimit, overageRate } = PLAN_LIMITS.free

  const [created] = await withDb((db) =>
    db
      .insert(SubscriptionTable)
      .values({
        organizationId,
        plan: "free",
        status: "active",
        runLimit,
        overageRate,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      })
      .onConflictDoNothing()
      .returning(),
  )
  if (created) return created

  const [refetched] = await withDb((db) =>
    db.select().from(SubscriptionTable).where(eq(SubscriptionTable.organizationId, organizationId)).limit(1),
  )
  if (!refetched) {
    throw new Error(`Subscription not found for organization ${organizationId}`)
  }
  return refetched
}

export const UpdateStripeInfoSubscriptionSchema = z.object({
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  stripePriceId: z.string().optional(),
  stripeScheduleId: z.string().optional().nullable(),
  status: z.enum(SubscriptionStatus).optional(),
  currentPeriodStart: z.date().optional(),
  currentPeriodEnd: z.date().optional(),
  scheduledPlan: z.enum(SubscriptionPlan).optional().nullable(),
  scheduledAt: z.date().optional().nullable(),
})

export const UpdatePlanSubscriptionSchema = z.object({ plan: z.enum(SubscriptionPlan) })

export const UpdateSubscriptionSchema = UpdateStripeInfoSubscriptionSchema.extend({ plan: z.enum(SubscriptionPlan) })

export async function updatePlanSubscription(raw: z.input<typeof UpdatePlanSubscriptionSchema>) {
  const input = UpdatePlanSubscriptionSchema.parse(raw)
  const { runLimit, overageRate } = PLAN_LIMITS[input.plan]

  await withDb((db) =>
    db
      .update(SubscriptionTable)
      .set({
        plan: input.plan,
        runLimit,
        overageRate,
        stripePriceId: getStripePriceIdSubscription(input.plan),
        updatedAt: new Date(),
      })
      .where(eq(SubscriptionTable.organizationId, principal.orgId())),
  )

  return currentSubscription({})
}

export async function updateStripeInfoSubscription(raw: z.input<typeof UpdateStripeInfoSubscriptionSchema>) {
  const input = UpdateStripeInfoSubscriptionSchema.parse(raw)
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (input.stripeCustomerId) updates.stripeCustomerId = input.stripeCustomerId
  if (input.stripeSubscriptionId) updates.stripeSubscriptionId = input.stripeSubscriptionId
  if (input.stripePriceId) updates.stripePriceId = input.stripePriceId
  if (input.stripeScheduleId !== undefined) updates.stripeScheduleId = input.stripeScheduleId
  if (input.status) updates.status = input.status
  if (input.currentPeriodStart) updates.currentPeriodStart = input.currentPeriodStart
  if (input.currentPeriodEnd) updates.currentPeriodEnd = input.currentPeriodEnd
  if (input.scheduledPlan !== undefined) updates.scheduledPlan = input.scheduledPlan
  if (input.scheduledAt !== undefined) updates.scheduledAt = input.scheduledAt

  await withDb((db) =>
    db.update(SubscriptionTable).set(updates).where(eq(SubscriptionTable.organizationId, principal.orgId())),
  )

  return currentSubscription({})
}

export async function updateSubscription(raw: z.input<typeof UpdateSubscriptionSchema>) {
  const input = UpdateSubscriptionSchema.parse(raw)
  const { runLimit, overageRate } = PLAN_LIMITS[input.plan]
  const updates: Record<string, unknown> = {
    plan: input.plan,
    runLimit,
    overageRate,
    stripePriceId: input.stripePriceId ?? getStripePriceIdSubscription(input.plan),
    updatedAt: new Date(),
  }
  if (input.stripeCustomerId) updates.stripeCustomerId = input.stripeCustomerId
  if (input.stripeSubscriptionId) updates.stripeSubscriptionId = input.stripeSubscriptionId
  if (input.stripeScheduleId !== undefined) updates.stripeScheduleId = input.stripeScheduleId
  if (input.status) updates.status = input.status
  if (input.currentPeriodStart) updates.currentPeriodStart = input.currentPeriodStart
  if (input.currentPeriodEnd) updates.currentPeriodEnd = input.currentPeriodEnd
  if (input.scheduledPlan !== undefined) updates.scheduledPlan = input.scheduledPlan
  if (input.scheduledAt !== undefined) updates.scheduledAt = input.scheduledAt

  await withDb((db) =>
    db.update(SubscriptionTable).set(updates).where(eq(SubscriptionTable.organizationId, principal.orgId())),
  )

  return currentSubscription({})
}
