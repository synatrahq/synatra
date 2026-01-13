import { Hono } from "hono"
import { removePrompt } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const del = new Hono().delete("/:id", requirePermission("prompt", "delete"), async (c) => {
  const id = c.req.param("id")
  await removePrompt(id)
  return c.json({ id, deleted: true })
})
