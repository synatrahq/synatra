import { Hono } from "hono"
import { currentSubscription } from "@synatra/core"

export const current = new Hono().get("/current", async (c) => {
  const subscription = await currentSubscription({})
  return c.json(subscription)
})
