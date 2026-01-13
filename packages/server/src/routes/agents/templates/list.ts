import { Hono } from "hono"
import { listAgentTemplates } from "@synatra/core"

export const list = new Hono().get("/", async (c) => {
  const templates = await listAgentTemplates()
  return c.json({ templates })
})
