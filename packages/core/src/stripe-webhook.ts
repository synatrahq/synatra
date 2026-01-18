import type Stripe from "stripe"
import { z } from "zod"
import { principal } from "./principal"
import {
  currentSubscription,
  updateStripeInfoSubscription,
  updateSubscription,
  getStripePriceIdSubscription,
  getPlanFromPriceIdSubscription,
} from "./subscription"
import { ensureStagingEnvironment } from "./environment"
import { findOrganizationByStripeCustomerId, findOrganizationById } from "./organization"
import { findOwnerMember } from "./member"
import { SubscriptionPlan, SubscriptionStatus } from "./types"
import { createError, isAppError } from "@synatra/util/error"
import { getStripe } from "./stripe"

export const HandleStripeWebhookEventSchema = z.object({
  event: z.custom<Stripe.Event>((val) => typeof val === "object" && val !== null && "type" in val),
})

export async function handleStripeWebhookEvent(raw: z.input<typeof HandleStripeWebhookEventSchema>) {
  const { event } = HandleStripeWebhookEventSchema.parse(raw)

  let organizationId: string | null = null

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      organizationId = session.metadata?.organizationId || null
      await handleCheckoutCompleted(session)
      break
    }
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice)
      break
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
      break
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
      break
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break
    case "subscription_schedule.completed":
      await handleScheduleCompleted(event.data.object as Stripe.SubscriptionSchedule)
      break
    case "subscription_schedule.canceled":
      await clearSchedule(event.data.object as Stripe.SubscriptionSchedule)
      break
    case "subscription_schedule.released":
      await clearSchedule(event.data.object as Stripe.SubscriptionSchedule)
      break
  }

  return { organizationId }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const organizationId = session.metadata?.organizationId
  const plan = session.metadata?.plan as SubscriptionPlan | undefined

  if (!organizationId || !plan) {
    throw createError("BadRequestError", {
      message: `Missing metadata in checkout session: organizationId=${organizationId || "missing"}, plan=${plan || "missing"}`,
    })
  }

  const customerId = getStripeId(session.customer)
  const subscriptionId = getStripeId(session.subscription)

  if (!customerId || !subscriptionId) {
    throw createError("BadRequestError", {
      message: `Missing customer or subscription ID in checkout session: customerId=${customerId || "missing"}, subscriptionId=${subscriptionId || "missing"}`,
    })
  }

  const owner = await findOwnerMember({ organizationId })
  if (!owner) {
    throw createError("NotFoundError", { type: "organization owner", id: organizationId })
  }

  await principal.withSystem({ organizationId, actingUserId: owner.userId }, async () => {
    await updateSubscription({
      plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: getStripePriceIdSubscription(plan) || undefined,
    })

    if (isPaidPlan(plan)) {
      await ensureStagingEnvironment()
    }
  })
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = getStripeId(invoice.customer)
  if (!customerId) return

  const org = await getOrgByCustomer(customerId)
  if (!org) return

  await principal.withSystem({ organizationId: org.id }, async () => {
    const sub = await currentSubscription({})

    if (!sub.stripeSubscriptionId) {
      await updateStripeInfoSubscription({ status: "active" })
      return
    }

    const stripeSub = await getStripe().subscriptions.retrieve(sub.stripeSubscriptionId)
    const item = stripeSub.items.data[0]
    if (!item) {
      await updateStripeInfoSubscription({ status: "active" })
      return
    }

    const periodStart = new Date(item.current_period_start * 1000)
    const periodEnd = new Date(item.current_period_end * 1000)
    const isNewPeriod = !sub.currentPeriodEnd || periodEnd > sub.currentPeriodEnd

    if (isNewPeriod) {
      await updateStripeInfoSubscription({
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      })
    } else {
      await updateStripeInfoSubscription({ status: "active" })
    }

    if (isPaidPlan(sub.plan as SubscriptionPlan)) {
      await ensureStagingEnvironment()
    }
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = getStripeId(invoice.customer)
  if (!customerId) return

  const org = await getOrgByCustomer(customerId)
  if (!org) return

  await principal.withSystem({ organizationId: org.id }, () => updateStripeInfoSubscription({ status: "past_due" }))
}

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
  const customerId = getStripeId(stripeSub.customer)
  if (!customerId) return

  const org = await getOrgByCustomer(customerId)
  if (!org) return

  await principal.withSystem({ organizationId: org.id }, async () => {
    const existing = await currentSubscription({})
    const item = stripeSub.items.data[0]
    if (!item) return

    const periodStart = new Date(item.current_period_start * 1000)
    const periodEnd = new Date(item.current_period_end * 1000)
    const isNewPeriod = !existing.currentPeriodEnd || periodEnd > existing.currentPeriodEnd
    const isNew = !existing.stripeSubscriptionId
    const cancelAt = stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null

    const newPriceId = item.price.id
    const detectedPlan = getPlanFromPriceIdSubscription(newPriceId)
    const planChanged = detectedPlan && detectedPlan !== existing.plan

    if (planChanged) {
      await updateSubscription({
        plan: detectedPlan,
        status: mapStripeStatus(stripeSub.status),
        stripeSubscriptionId: isNew ? stripeSub.id : undefined,
        stripePriceId: newPriceId,
        cancelAt,
        ...(isNewPeriod && { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }),
      })
    } else {
      await updateStripeInfoSubscription({
        status: mapStripeStatus(stripeSub.status),
        stripeSubscriptionId: isNew ? stripeSub.id : undefined,
        stripePriceId: newPriceId,
        cancelAt,
        ...(isNewPeriod && { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }),
      })
    }
  })
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
  const customerId = getStripeId(stripeSub.customer)
  if (!customerId) return

  const org = await getOrgByCustomer(customerId)
  if (!org) return

  await principal.withSystem({ organizationId: org.id }, async () => {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    await updateSubscription({
      plan: "free",
      status: "cancelled",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })
  })
}

async function getOrgByCustomer(customerId: string) {
  const cached = await findOrganizationByStripeCustomerId({ stripeCustomerId: customerId })
  if (cached) return cached

  const customer = await getStripe().customers.retrieve(customerId)
  if (customer.deleted || !customer.metadata?.organizationId) return null

  return findOrganizationById(customer.metadata.organizationId)
}

async function getOrgFromSchedule(schedule: Stripe.SubscriptionSchedule) {
  const subscriptionId = getStripeId(schedule.subscription)
  if (!subscriptionId) return null

  const stripeSub = await getStripe().subscriptions.retrieve(subscriptionId)
  const customerId = getStripeId(stripeSub.customer)
  if (!customerId) return null

  const org = await getOrgByCustomer(customerId)
  return org ? { org, stripeSub } : null
}

async function handleScheduleCompleted(schedule: Stripe.SubscriptionSchedule): Promise<void> {
  const result = await getOrgFromSchedule(schedule)
  if (!result) return

  await principal.withSystem({ organizationId: result.org.id }, async () => {
    const sub = await currentSubscription({})
    if (!sub.scheduledPlan) return

    const newPlan = sub.scheduledPlan as SubscriptionPlan

    await updateSubscription({
      plan: newPlan,
      stripePriceId: result.stripeSub.items.data[0]?.price.id,
      scheduledPlan: null,
      scheduledAt: null,
      stripeScheduleId: null,
    })
  })
}

async function clearSchedule(schedule: Stripe.SubscriptionSchedule): Promise<void> {
  const result = await getOrgFromSchedule(schedule)
  if (!result) return

  await principal.withSystem({ organizationId: result.org.id }, () =>
    updateStripeInfoSubscription({ scheduledPlan: null, scheduledAt: null, stripeScheduleId: null }),
  )
}

function isPaidPlan(plan: SubscriptionPlan): boolean {
  return plan !== "free"
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active"
    case "past_due":
    case "paused":
      return "past_due"
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return "cancelled"
  }
}

function getStripeId(obj: string | { id: string } | null | undefined): string | null {
  if (!obj) return null
  return typeof obj === "string" ? obj : obj.id
}

export function shouldRetryWebhookError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : ""
  const permanent =
    (isAppError(err) && (err.name === "NotFoundError" || err.name === "BadRequestError")) ||
    msg.includes("not found") ||
    msg.includes("Invalid") ||
    msg.includes("validation")

  return !permanent
}
