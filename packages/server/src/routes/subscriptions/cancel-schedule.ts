import { Hono } from "hono"
import { cancelSubscriptionScheduledPlan } from "@synatra/core"

export const cancelSchedule = new Hono().post("/cancel-schedule", async (c) => {
  const result = await cancelSubscriptionScheduledPlan()
  return c.json(result)
})
