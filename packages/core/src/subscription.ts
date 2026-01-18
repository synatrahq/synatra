import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { principal } from "./principal"
import { withDb } from "./database"
import { SubscriptionTable } from "./schema"
import { SubscriptionPlan, SubscriptionStatus, PLAN_HIERARCHY } from "./types"
import { config } from "./config"
import { getStripe } from "./stripe"
import { findOrganizationById } from "./organization"
import { createError } from "@synatra/util/error"
import { ensureStagingEnvironment } from "./environment"

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

  const [created] = await withDb((db) =>
    db
      .insert(SubscriptionTable)
      .values({
        organizationId,
        plan: "free",
        status: "active",
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
  cancelAt: z.date().optional().nullable(),
})

export const UpdatePlanSubscriptionSchema = z.object({ plan: z.enum(SubscriptionPlan) })

export const UpdateSubscriptionSchema = UpdateStripeInfoSubscriptionSchema.extend({ plan: z.enum(SubscriptionPlan) })

export async function updatePlanSubscription(raw: z.input<typeof UpdatePlanSubscriptionSchema>) {
  const input = UpdatePlanSubscriptionSchema.parse(raw)

  await withDb((db) =>
    db
      .update(SubscriptionTable)
      .set({
        plan: input.plan,
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
  if (input.cancelAt !== undefined) updates.cancelAt = input.cancelAt

  await withDb((db) =>
    db.update(SubscriptionTable).set(updates).where(eq(SubscriptionTable.organizationId, principal.orgId())),
  )

  return currentSubscription({})
}

export async function updateSubscription(raw: z.input<typeof UpdateSubscriptionSchema>) {
  const input = UpdateSubscriptionSchema.parse(raw)
  const updates: Record<string, unknown> = {
    plan: input.plan,
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
  if (input.cancelAt !== undefined) updates.cancelAt = input.cancelAt

  await withDb((db) =>
    db.update(SubscriptionTable).set(updates).where(eq(SubscriptionTable.organizationId, principal.orgId())),
  )

  return currentSubscription({})
}

export const CreateCheckoutSessionSchema = z.object({
  plan: z.enum(SubscriptionPlan),
  successUrl: z.url(),
  cancelUrl: z.url(),
})

export async function createCheckoutSession(raw: z.input<typeof CreateCheckoutSessionSchema>) {
  const input = CreateCheckoutSessionSchema.parse(raw)

  if (input.plan === "free") {
    throw createError("BadRequestError", { message: "Invalid plan for checkout" })
  }

  const priceId = getStripePriceIdSubscription(input.plan)
  if (!priceId) {
    throw createError("BadRequestError", { message: "Price ID not found for plan" })
  }

  const org = await findOrganizationById(principal.orgId())
  if (!org) {
    throw createError("NotFoundError", { type: "organization", id: principal.orgId() })
  }

  const stripe = getStripe()
  const sub = await currentSubscription({})

  const customerId = sub.stripeCustomerId || (await getOrCreateCustomer(stripe, org))

  if (!sub.stripeCustomerId) {
    await updateStripeInfoSubscription({ stripeCustomerId: customerId })
  }

  const session = await stripe.checkout.sessions.create(
    {
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { organizationId: org.id, plan: input.plan },
    },
    { idempotencyKey: randomUUID() },
  )

  return { sessionId: session.id, url: session.url }
}

async function getOrCreateCustomer(
  stripe: ReturnType<typeof getStripe>,
  org: { id: string; name: string },
): Promise<string> {
  const existing = await stripe.customers.search({ query: `metadata['organizationId']:'${org.id}'`, limit: 1 })
  if (existing.data.length > 0) return existing.data[0].id

  const customer = await stripe.customers.create(
    { name: org.name, metadata: { organizationId: org.id } },
    { idempotencyKey: `customer-${org.id}` },
  )
  return customer.id
}

export const CreateBillingPortalSessionSchema = z.object({
  returnUrl: z.url(),
})

export async function createBillingPortalSession(raw: z.input<typeof CreateBillingPortalSessionSchema>) {
  const input = CreateBillingPortalSessionSchema.parse(raw)
  const sub = await currentSubscription({})

  if (!sub.stripeCustomerId) {
    throw createError("BadRequestError", { message: "No Stripe customer found" })
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create(
    {
      customer: sub.stripeCustomerId,
      return_url: input.returnUrl,
    },
    { idempotencyKey: randomUUID() },
  )

  return { url: session.url }
}

export const CancelSubscriptionScheduledPlanSchema = z.object({}).optional()

export async function cancelSubscriptionScheduledPlan(raw?: z.input<typeof CancelSubscriptionScheduledPlanSchema>) {
  CancelSubscriptionScheduledPlanSchema.parse(raw)
  const sub = await currentSubscription({})

  if (!sub.stripeScheduleId) {
    throw createError("BadRequestError", { message: "No scheduled plan change found" })
  }

  const stripe = getStripe()
  await stripe.subscriptionSchedules.release(sub.stripeScheduleId, { idempotencyKey: randomUUID() })

  await principal.withSystem({ organizationId: sub.organizationId }, () =>
    updateStripeInfoSubscription({
      stripeScheduleId: null,
      scheduledPlan: null,
      scheduledAt: null,
    }),
  )

  return { message: "Scheduled plan change cancelled", plan: sub.plan }
}

export const ChangeSubscriptionPlanSchema = z.object({
  plan: z.enum(SubscriptionPlan),
})

export async function changeSubscriptionPlan(raw: z.input<typeof ChangeSubscriptionPlanSchema>) {
  const input = ChangeSubscriptionPlanSchema.parse(raw)

  if (input.plan === "free") {
    throw createError("BadRequestError", { message: "Cannot change to free plan via this endpoint" })
  }

  const sub = await currentSubscription({})

  if (!sub.stripeSubscriptionId) {
    throw createError("BadRequestError", {
      message: "No active subscription found. Please use checkout to start a subscription.",
    })
  }
  if (sub.status === "cancelled") {
    throw createError("BadRequestError", {
      message: "Cannot change plan for cancelled subscription. Please reactivate via billing portal.",
    })
  }
  if (sub.plan === input.plan) {
    throw createError("BadRequestError", { message: "Already on this plan" })
  }
  if (sub.stripeScheduleId) {
    throw createError("BadRequestError", {
      message: "A plan change is already scheduled. Please cancel it before scheduling another change.",
    })
  }

  const priceId = getStripePriceIdSubscription(input.plan)
  if (!priceId) {
    throw createError("BadRequestError", { message: "Price ID not found for plan" })
  }

  const stripe = getStripe()
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId)
  const item = stripeSub.items.data[0]
  if (!item) {
    throw createError("InternalError", { message: "Subscription has no items" })
  }

  if (isUpgradeSubscription(sub.plan as SubscriptionPlan, input.plan)) {
    await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      { items: [{ id: item.id, price: priceId }], proration_behavior: "always_invoice" },
      { idempotencyKey: randomUUID() },
    )

    await principal.withSystem({ organizationId: sub.organizationId }, async () => {
      await updateSubscription({ plan: input.plan, stripePriceId: priceId })

      if (sub.plan === "free") {
        await ensureStagingEnvironment()
      }
    })

    return { message: "Plan upgraded successfully", plan: input.plan, effectiveImmediately: true }
  }

  const schedule = await stripe.subscriptionSchedules.create(
    { from_subscription: sub.stripeSubscriptionId },
    { idempotencyKey: randomUUID() },
  )

  const [updated, updateErr] = await stripe.subscriptionSchedules
    .update(
      schedule.id,
      {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: item.price.id }],
            start_date: schedule.phases[0].start_date,
            end_date: item.current_period_end,
          },
          { items: [{ price: priceId }] },
        ],
      },
      { idempotencyKey: randomUUID() },
    )
    .then((r) => [r, null] as const)
    .catch((e) => [null, e] as const)

  if (updateErr) {
    await stripe.subscriptionSchedules.release(schedule.id, { idempotencyKey: randomUUID() }).catch(() => {})
    throw updateErr
  }

  const scheduledAt = new Date(item.current_period_end * 1000)

  await principal.withSystem({ organizationId: sub.organizationId }, () =>
    updateStripeInfoSubscription({ stripeScheduleId: updated!.id, scheduledPlan: input.plan, scheduledAt }),
  )

  return {
    message: "Plan downgrade scheduled",
    plan: input.plan,
    effectiveImmediately: false,
    effectiveAt: scheduledAt.toISOString(),
    currentPlan: sub.plan,
  }
}
