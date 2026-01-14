import { Hono } from "hono"
import type Stripe from "stripe"
import {
  isProcessedStripeEvent,
  markProcessedStripeEvent,
  handleStripeWebhookEvent,
  shouldRetryWebhookError,
  getStripe,
} from "@synatra/core"
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
    const { organizationId } = await handleStripeWebhookEvent({ event })

    await markProcessedStripeEvent({
      eventId: event.id,
      eventType: event.type,
      organizationId: organizationId || undefined,
    })

    return c.json({ received: true })
  } catch (err) {
    const shouldRetry = shouldRetryWebhookError(err)

    console.error(
      JSON.stringify({
        level: "error",
        message: "Webhook handler error",
        eventType: event.type,
        eventId: event.id,
        permanent: !shouldRetry,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }),
    )

    if (!shouldRetry) {
      await markProcessedStripeEvent({ eventId: event.id, eventType: event.type })
      return c.json({ received: true })
    }

    return c.json({ error: "Handler failed" }, 500)
  }
})
