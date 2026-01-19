import { Hono } from "hono"
import { cancelSubscription } from "@synatra/core"

export const cancel = new Hono().post("/cancel", async (c) => {
  const result = await cancelSubscription()
  return c.json(result)
})
