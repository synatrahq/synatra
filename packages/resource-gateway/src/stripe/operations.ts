import { z } from "zod"
import type Stripe from "stripe"
import type { StripeResource } from "../types"

export const stripeOperation = z.object({
  type: z.literal("stripe"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  queryParams: z.record(z.string(), z.string()).optional(),
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

  let path = operation.path
  if (operation.queryParams && Object.keys(operation.queryParams).length > 0) {
    const params = new URLSearchParams(operation.queryParams).toString()
    path = path.includes("?") ? `${path}&${params}` : `${path}?${params}`
  }

  const data = await client.rawRequest(operation.method, path, operation.body as Record<string, unknown> | undefined)
  return { data }
}
