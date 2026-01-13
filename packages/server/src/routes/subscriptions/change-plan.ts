import { randomUUID } from "crypto"
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  currentSubscription,
  getStripePriceIdSubscription,
  isUpgradeSubscription,
  updateSubscription,
  updateStripeInfoSubscription,
  principal,
  updateUsageCurrentPeriodLimit,
  ensureStagingEnvironment,
  getStripe,
} from "@synatra/core"
import { SubscriptionPlan } from "@synatra/core/types"

const schema = z.object({
  plan: z.enum(SubscriptionPlan),
})
export const changePlan = new Hono().post("/change-plan", zValidator("json", schema), async (c) => {
  const { plan } = c.req.valid("json")

  if (plan === "free") {
    return c.json({ error: "Cannot change to free plan via this endpoint" }, 400)
  }

  const sub = await currentSubscription({})

  if (!sub.stripeSubscriptionId) {
    return c.json({ error: "No active subscription found. Please use checkout to start a subscription." }, 400)
  }
  if (sub.status === "cancelled") {
    return c.json(
      { error: "Cannot change plan for cancelled subscription. Please reactivate via billing portal." },
      400,
    )
  }
  if (sub.plan === plan) {
    return c.json({ error: "Already on this plan" }, 400)
  }
  if (sub.stripeScheduleId) {
    return c.json(
      {
        error: "A plan change is already scheduled. Please cancel it before scheduling another change.",
      },
      400,
    )
  }

  const priceId = getStripePriceIdSubscription(plan)
  if (!priceId) return c.json({ error: "Price ID not found for plan" }, 400)

  const stripe = getStripe()
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId)
  const item = stripeSub.items.data[0]
  if (!item) return c.json({ error: "Subscription has no items" }, 500)

  if (isUpgradeSubscription(sub.plan as SubscriptionPlan, plan)) {
    await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      { items: [{ id: item.id, price: priceId }], proration_behavior: "always_invoice" },
      { idempotencyKey: randomUUID() },
    )

    await principal.withSystem({ organizationId: sub.organizationId }, async () => {
      await updateSubscription({ plan, stripePriceId: priceId })
      await updateUsageCurrentPeriodLimit({})

      if (sub.plan === "free") {
        await ensureStagingEnvironment()
      }
    })

    return c.json({ message: "Plan upgraded successfully", plan, effectiveImmediately: true })
  }

  const schedule = await stripe.subscriptionSchedules.create(
    { from_subscription: sub.stripeSubscriptionId },
    { idempotencyKey: randomUUID() },
  )

  const [updated, updateErr] = await stripe.subscriptionSchedules
    .update(
      schedule.id,
      {
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
    updateStripeInfoSubscription({ stripeScheduleId: updated!.id, scheduledPlan: plan, scheduledAt }),
  )

  return c.json({
    message: "Plan downgrade scheduled",
    plan,
    effectiveImmediately: false,
    effectiveAt: scheduledAt.toISOString(),
    currentPlan: sub.plan,
  })
})
