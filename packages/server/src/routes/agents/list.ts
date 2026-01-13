import { Hono } from "hono"
import { listAgents } from "@synatra/core"

export const list = new Hono().get("/", async (c) => {
  const results = await listAgents()
  return c.json(results)
})
