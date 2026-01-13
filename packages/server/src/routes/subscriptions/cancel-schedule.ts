import { Hono } from "hono"
import { cancelScheduledPlanChange } from "@synatra/core"

export const cancelSchedule = new Hono().post("/cancel-schedule", async (c) => {
  const result = await cancelScheduledPlanChange()
  return c.json(result)
})
