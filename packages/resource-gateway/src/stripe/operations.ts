import { z } from "zod"
import type Stripe from "stripe"
import type { StripeResource } from "../types"

export const stripeOperation = z.object({
  type: z.literal("stripe"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  body: z.unknown().optional(),
})

export type StripeOperation = z.infer<typeof stripeOperation>

interface OperationResult {
  data: unknown
}

const STRIPE_TIMEOUT_MS = 15000

export async function executeStripeOperation(
  resource: StripeResource,
  operation: StripeOperation,
): Promise<OperationResult> {
  const Stripe = (await import("stripe")).default
  const client = new Stripe(resource.config.apiKey, {
    apiVersion: resource.config.apiVersion as Stripe.LatestApiVersion,
    timeout: STRIPE_TIMEOUT_MS,
  })
  const data = await client.rawRequest(
    operation.method,
    operation.path,
    operation.body as Record<string, unknown> | undefined,
  )
  return { data }
}
