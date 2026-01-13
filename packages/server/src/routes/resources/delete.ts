import { Hono } from "hono"
import { removeResource } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const del = new Hono().delete("/:id", requirePermission("resource", "delete"), async (c) => {
  const id = c.req.param("id")
  await removeResource(id)
  return c.json({ id, deleted: true })
})
