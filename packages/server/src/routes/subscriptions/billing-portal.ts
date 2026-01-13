import { randomUUID } from "crypto"
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { currentSubscription, getStripe } from "@synatra/core"

const schema = z.object({
  returnUrl: z.url(),
})

export const billingPortal = new Hono().post("/billing-portal", zValidator("json", schema), async (c) => {
  const { returnUrl } = c.req.valid("json")
  const sub = await currentSubscription({})

  if (!sub.stripeCustomerId) {
    return c.json({ error: "No Stripe customer found" }, 400)
  }

  const stripe = getStripe()

  const session = await stripe.billingPortal.sessions.create(
    {
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    },
    { idempotencyKey: randomUUID() },
  )

  return c.json({ url: session.url })
})
