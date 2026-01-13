import { Hono } from "hono"
import { listTriggers } from "@synatra/core"

export const list = new Hono().get("/", async (c) => {
  const triggers = await listTriggers()
  return c.json(triggers)
})
