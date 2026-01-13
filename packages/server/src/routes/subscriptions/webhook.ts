import { Hono } from "hono"
import type Stripe from "stripe"
import {
  principal,
  isProcessedStripeEvent,
  markProcessedStripeEvent,
  currentSubscription,
  updateStripeInfoSubscription,
  updateSubscription,
  getStripePriceIdSubscription,
  getPlanFromPriceIdSubscription,
  updateUsageCurrentPeriodLimit,
  resetUsagePeriod,
  ensureStagingEnvironment,
  findOrganizationByStripeCustomerId,
  findOrganizationById,
  findOwnerMember,
  getStripe,
} from "@synatra/core"
import { SubscriptionPlan, SubscriptionStatus } from "@synatra/core/types"
import { createError, isAppError } from "@synatra/util/error"
import { config } from "../../config"

export const webhook = new Hono().post("/webhook", async (c) => {
  const stripe = getStripe()
  const stripeConfig = config().stripe
  if (!stripeConfig) return c.json({ error: "Stripe not configured" }, 500)

  const signature = c.req.header("stripe-signature")
  if (!signature) return c.json({ error: "No signature" }, 400)

  let event: Stripe.Event
  try {
    const body = await c.req.text()
    event = stripe.webhooks.constructEvent(body, signature, stripeConfig.webhookSecret)
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Webhook signature verification failed",
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }),
    )
    return c.json({ error: "Invalid signature" }, 400)
  }

  if (await isProcessedStripeEvent({ eventId: event.id })) {
    return c.json({ received: true })
  }

  try {
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

    await markProcessedStripeEvent({
      eventId: event.id,
      eventType: event.type,
      organizationId: organizationId || undefined,
    })

    return c.json({ received: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    const permanent =
      (isAppError(err) && (err.name === "NotFoundError" || err.name === "BadRequestError")) ||
      msg.includes("not found") ||
      msg.includes("Invalid") ||
      msg.includes("validation")

    console.error(
      JSON.stringify({
        level: "error",
        message: "Webhook handler error",
        eventType: event.type,
        eventId: event.id,
        permanent,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }),
    )

    if (permanent) {
      await markProcessedStripeEvent({ eventId: event.id, eventType: event.type })
      return c.json({ received: true })
    }

    return c.json({ error: "Handler failed" }, 500)
  }
})

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
    await updateUsageCurrentPeriodLimit({})

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
      await resetUsagePeriod({ periodStart, periodEnd })
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

    const newPriceId = item.price.id
    const detectedPlan = getPlanFromPriceIdSubscription(newPriceId)
    const planChanged = detectedPlan && detectedPlan !== existing.plan

    if (planChanged) {
      await updateSubscription({
        plan: detectedPlan,
        status: mapStripeStatus(stripeSub.status),
        stripeSubscriptionId: isNew ? stripeSub.id : undefined,
        stripePriceId: newPriceId,
        ...(isNewPeriod && { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }),
      })
    } else {
      await updateStripeInfoSubscription({
        status: mapStripeStatus(stripeSub.status),
        stripeSubscriptionId: isNew ? stripeSub.id : undefined,
        stripePriceId: newPriceId,
        ...(isNewPeriod && { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }),
      })
    }

    if (isNewPeriod) {
      await resetUsagePeriod({ periodStart, periodEnd })
    } else if (planChanged) {
      await updateUsageCurrentPeriodLimit({})
    }
  })
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
  const customerId = getStripeId(stripeSub.customer)
  if (!customerId) return

  const org = await getOrgByCustomer(customerId)
  if (!org) return

  await principal.withSystem({ organizationId: org.id }, async () => {
    await updateSubscription({ plan: "free", status: "cancelled" })
    await updateUsageCurrentPeriodLimit({})
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
