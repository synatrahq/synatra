import { randomUUID } from "crypto"
import { Hono } from "hono"
import { currentSubscription, updateStripeInfoSubscription, principal, getStripe } from "@synatra/core"

export const cancelSchedule = new Hono().post("/cancel-schedule", async (c) => {
  const sub = await currentSubscription({})

  if (!sub.stripeScheduleId) {
    return c.json({ error: "No scheduled plan change found" }, 400)
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

  return c.json({ message: "Scheduled plan change cancelled", plan: sub.plan })
})
