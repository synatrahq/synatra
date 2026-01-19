import { Hono } from "hono"
import { resumeSubscription } from "@synatra/core"

export const resume = new Hono().post("/resume", async (c) => {
  const result = await resumeSubscription()
  return c.json(result)
})
