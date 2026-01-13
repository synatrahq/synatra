import { Hono } from "hono"
import { removeAgent } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const del = new Hono().delete("/:id", requirePermission("agent", "delete"), async (c) => {
  const id = c.req.param("id")
  await removeAgent(id)
  return c.json({ id, deleted: true })
})
