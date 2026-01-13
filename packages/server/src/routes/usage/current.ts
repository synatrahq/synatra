import { Hono } from "hono"
import { currentUsage } from "@synatra/core"

export const current = new Hono().get("/current", async (c) => {
  const usage = await currentUsage({})
  return c.json(usage)
})
