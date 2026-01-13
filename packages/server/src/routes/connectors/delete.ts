import { Hono } from "hono"
import { removeConnector } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"
import { createError } from "@synatra/util/error"

export const del = new Hono().delete("/:id", requirePermission("connector", "delete"), async (c) => {
  const id = c.req.param("id")
  const deleted = await removeConnector(id)
  if (!deleted) throw createError("NotFoundError", { type: "Connector", id })
  return c.json({ id, deleted: true })
})
