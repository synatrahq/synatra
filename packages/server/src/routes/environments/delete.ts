import { Hono } from "hono"
import { removeEnvironment } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const del = new Hono().delete("/:id", requirePermission("environment", "delete"), async (c) => {
  const id = c.req.param("id")
  await removeEnvironment(id)
  return c.json({ id, deleted: true })
})
