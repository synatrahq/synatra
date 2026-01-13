import { randomUUID } from "crypto"
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  currentSubscription,
  getStripePriceIdSubscription,
  updateStripeInfoSubscription,
  findOrganizationById,
  principal,
} from "@synatra/core"
import { SubscriptionPlan } from "@synatra/core/types"
import { getStripe } from "../../stripe"

const schema = z.object({
  plan: z.enum(SubscriptionPlan),
  successUrl: z.url(),
  cancelUrl: z.url(),
})

export const createCheckout = new Hono().post("/create-checkout", zValidator("json", schema), async (c) => {
  const { plan, successUrl, cancelUrl } = c.req.valid("json")

  if (plan === "free") {
    return c.json({ error: "Invalid plan for checkout" }, 400)
  }

  const priceId = getStripePriceIdSubscription(plan)
  if (!priceId) return c.json({ error: "Price ID not found for plan" }, 400)

  const org = await findOrganizationById(principal.orgId())
  if (!org) return c.json({ error: "Organization not found" }, 404)

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
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { organizationId: org.id, plan },
    },
    { idempotencyKey: randomUUID() },
  )

  return c.json({ sessionId: session.id, url: session.url })
})

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
