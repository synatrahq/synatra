import { Hono } from "hono"
import { listEnvironments } from "@synatra/core"

export const list = new Hono().get("/", async (c) => {
  const results = await listEnvironments()
  return c.json(results)
})
