import { randomUUID } from "crypto"
import { z } from "zod"
import { currentSubscription } from "./subscription"
import { getStripeOrNull } from "./stripe"

async function emit(event: string, value: string, identifier: string): Promise<void> {
  const client = getStripeOrNull()
  if (!client) return

  const sub = await currentSubscription({})
  if (!sub.stripeCustomerId) return

  await client.billing.meterEvents
    .create({
      event_name: event,
      payload: { stripe_customer_id: sub.stripeCustomerId, value },
      identifier,
    })
    .catch((err) => {
      if (err.code === "duplicate_meter_event") return
      console.error(
        JSON.stringify({
          level: "error",
          message: "Failed to record meter event",
          eventName: event,
          value,
          organizationId: sub.organizationId,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        }),
      )
    })
}

export const RecordRunMeterSchema = z.object({ runId: z.string().optional() }).optional()

export async function recordRunMeter(input?: z.input<typeof RecordRunMeterSchema>) {
  const data = RecordRunMeterSchema.parse(input)
  return emit("run.completed", "1", data?.runId || randomUUID())
}
