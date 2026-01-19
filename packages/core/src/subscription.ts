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
import { resetUsageMonth } from "./usage"

export function isUpgradeSubscription(current: SubscriptionPlan, next: SubscriptionPlan): boolean {
  return PLAN_HIERARCHY[next] > PLAN_HIERARCHY[current]
}

export function isDowngradeSubscription(current: SubscriptionPlan, next: SubscriptionPlan): boolean {
  return PLAN_HIERARCHY[next] < PLAN_HIERARCHY[current]
}

type PlanPrices = { license: string; overage: string }

export function getStripePricesSubscription(plan: SubscriptionPlan): PlanPrices | null {
  if (plan === "free") return null
  const stripe = config().stripe
  if (!stripe) return null
  const prices: Record<string, PlanPrices | undefined> = {
    starter: stripe.priceStarter,
    pro: stripe.pricePro,
    business: stripe.priceBusiness,
  }
  return prices[plan] ?? null
}

export function getPlanFromPriceIdSubscription(priceId: string): SubscriptionPlan | null {
  const stripe = config().stripe
  if (!stripe) return null

  if (priceId === stripe.priceStarter?.license) return "starter"
  if (priceId === stripe.pricePro?.license) return "pro"
  if (priceId === stripe.priceBusiness?.license) return "business"
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
  const prices = getStripePricesSubscription(input.plan)

  await withDb((db) =>
    db
      .update(SubscriptionTable)
      .set({
        plan: input.plan,
        stripePriceId: prices?.license ?? null,
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
  const prices = getStripePricesSubscription(input.plan)
  const updates: Record<string, unknown> = {
    plan: input.plan,
    stripePriceId: input.stripePriceId ?? prices?.license ?? null,
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

  const prices = getStripePricesSubscription(input.plan)
  if (!prices) {
    throw createError("BadRequestError", { message: "Price IDs not found for plan" })
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

  const now = new Date()
  const nextMonthFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const billingCycleAnchor = Math.floor(nextMonthFirst.getTime() / 1000)

  const session = await stripe.checkout.sessions.create(
    {
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: prices.license, quantity: 1 }, { price: prices.overage }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { organizationId: org.id, plan: input.plan },
      subscription_data: {
        billing_cycle_anchor: billingCycleAnchor,
        proration_behavior: "create_prorations",
        billing_mode: { type: "flexible" },
      },
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

export const CancelSubscriptionSchema = z.object({}).optional()

export async function cancelSubscription(raw?: z.input<typeof CancelSubscriptionSchema>) {
  CancelSubscriptionSchema.parse(raw)
  const sub = await currentSubscription({})

  if (!sub.stripeSubscriptionId) {
    throw createError("BadRequestError", { message: "No active subscription found" })
  }
  if (sub.status === "cancelled") {
    throw createError("BadRequestError", { message: "Subscription is already cancelled" })
  }
  if (sub.cancelAt) {
    throw createError("BadRequestError", { message: "Subscription is already scheduled to cancel" })
  }

  const stripe = getStripe()
  await stripe.subscriptions.update(
    sub.stripeSubscriptionId,
    { cancel_at_period_end: true },
    { idempotencyKey: randomUUID() },
  )

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId)
  const cancelAt = stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null

  await updateStripeInfoSubscription({ cancelAt })

  return { message: "Subscription will be cancelled at period end", cancelAt: cancelAt?.toISOString() }
}

export const ResumeSubscriptionSchema = z.object({}).optional()

export function canResumeSubscription(sub: {
  stripeSubscriptionId: string | null
  cancelAt: Date | null
  status: string
}): sub is { stripeSubscriptionId: string; cancelAt: Date; status: string } {
  return !!sub.stripeSubscriptionId && sub.status !== "cancelled" && !!sub.cancelAt
}

export async function resumeSubscription(raw?: z.input<typeof ResumeSubscriptionSchema>) {
  ResumeSubscriptionSchema.parse(raw)
  const sub = await currentSubscription({})

  if (!canResumeSubscription(sub)) {
    if (!sub.stripeSubscriptionId) {
      throw createError("BadRequestError", { message: "No active subscription found" })
    }
    if (sub.status === "cancelled") {
      throw createError("BadRequestError", { message: "Subscription is cancelled" })
    }
    throw createError("BadRequestError", { message: "Subscription is not scheduled to cancel" })
  }

  const stripe = getStripe()
  await stripe.subscriptions.update(
    sub.stripeSubscriptionId,
    { cancel_at_period_end: false },
    { idempotencyKey: randomUUID() },
  )

  await updateStripeInfoSubscription({ cancelAt: null })

  return { message: "Subscription cancellation has been reversed" }
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

  const newPrices = getStripePricesSubscription(input.plan)
  if (!newPrices) {
    throw createError("BadRequestError", { message: "Price IDs not found for plan" })
  }

  const stripe = getStripe()
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId)
  const items = stripeSub.items.data
  if (items.length === 0) {
    throw createError("InternalError", { message: "Subscription has no items" })
  }

  const licenseItem = items.find((i) => i.price.recurring?.usage_type === "licensed")
  const overageItem = items.find((i) => i.price.recurring?.usage_type === "metered")

  if (!licenseItem || !overageItem) {
    throw createError("InternalError", { message: "Subscription is missing license or overage item" })
  }

  if (isUpgradeSubscription(sub.plan as SubscriptionPlan, input.plan)) {
    await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      {
        items: [
          { id: licenseItem.id, price: newPrices.license },
          { id: overageItem.id, price: newPrices.overage },
        ],
        proration_behavior: "always_invoice",
      },
      { idempotencyKey: randomUUID() },
    )

    await principal.withSystem({ organizationId: sub.organizationId }, async () => {
      await updateSubscription({ plan: input.plan, stripePriceId: newPrices.license })
      await resetUsageMonth()

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

  const currentPhase = schedule.phases[0]
  const extractDiscountId = (d: {
    discount?: string | { id: string } | null
    coupon?: string | { id: string } | null
  }) => {
    if (d.discount) return { discount: typeof d.discount === "string" ? d.discount : d.discount.id }
    if (d.coupon) return { coupon: typeof d.coupon === "string" ? d.coupon : d.coupon.id }
    return {}
  }
  const phaseDiscounts = currentPhase.discounts?.length
    ? currentPhase.discounts.map(extractDiscountId).filter((d) => d.discount || d.coupon)
    : undefined
  const phaseTaxRates = currentPhase.default_tax_rates?.length
    ? currentPhase.default_tax_rates.map((t) => (typeof t === "string" ? t : t.id))
    : undefined
  const phaseMetadata =
    currentPhase.metadata && Object.keys(currentPhase.metadata).length > 0 ? currentPhase.metadata : undefined

  const [updated, updateErr] = await stripe.subscriptionSchedules
    .update(
      schedule.id,
      {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: licenseItem.price.id, quantity: 1 }, { price: overageItem.price.id }],
            start_date: currentPhase.start_date,
            end_date: licenseItem.current_period_end,
            ...(phaseDiscounts && { discounts: phaseDiscounts }),
            ...(phaseTaxRates && { default_tax_rates: phaseTaxRates }),
            ...(phaseMetadata && { metadata: phaseMetadata }),
          },
          {
            items: [{ price: newPrices.license, quantity: 1 }, { price: newPrices.overage }],
            ...(phaseDiscounts && { discounts: phaseDiscounts }),
            ...(phaseTaxRates && { default_tax_rates: phaseTaxRates }),
            ...(phaseMetadata && { metadata: phaseMetadata }),
          },
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

  const scheduledAt = new Date(licenseItem.current_period_end * 1000)

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
