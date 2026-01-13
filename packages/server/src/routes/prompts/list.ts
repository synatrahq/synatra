import { Hono } from "hono"
import { listPrompts } from "@synatra/core"

export const list = new Hono().get("/", async (c) => {
  const results = await listPrompts()
  return c.json(results)
})
