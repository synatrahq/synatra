import { eq } from "drizzle-orm"
import { z } from "zod"
import { withDb } from "./database"
import { StripeEventTable } from "./schema"

export const IsProcessedStripeEventSchema = z.object({ eventId: z.string() })

export const MarkProcessedStripeEventSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  organizationId: z.string().optional(),
})

export async function isProcessedStripeEvent(raw: z.input<typeof IsProcessedStripeEventSchema>) {
  const input = IsProcessedStripeEventSchema.parse(raw)
  const existing = await withDb((db) =>
    db.select().from(StripeEventTable).where(eq(StripeEventTable.stripeEventId, input.eventId)).limit(1),
  )
  return existing.length > 0
}

export async function markProcessedStripeEvent(raw: z.input<typeof MarkProcessedStripeEventSchema>) {
  const input = MarkProcessedStripeEventSchema.parse(raw)
  await withDb((db) =>
    db
      .insert(StripeEventTable)
      .values({
        stripeEventId: input.eventId,
        eventType: input.eventType,
        organizationId: input.organizationId || null,
      })
      .onConflictDoNothing(),
  )
}
