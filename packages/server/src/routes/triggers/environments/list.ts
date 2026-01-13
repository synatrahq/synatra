import { Hono } from "hono"
import { getTriggerById, listTriggerEnvironments } from "@synatra/core"

export const list = new Hono().get("/:id/environments", async (c) => {
  const id = c.req.param("id")
  await getTriggerById(id)
  const environments = await listTriggerEnvironments(id)
  return c.json(environments)
})
