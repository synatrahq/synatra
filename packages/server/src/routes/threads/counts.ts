import { Hono } from "hono"
import { countThreads } from "@synatra/core"

export const counts = new Hono().get("/counts", async (c) => {
  const results = await countThreads({})
  return c.json(results)
})
