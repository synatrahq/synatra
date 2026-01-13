import { Hono } from "hono"
import { unarchiveChannel } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const unarchive = new Hono().post("/:id/unarchive", requirePermission("channel", "update"), async (c) => {
  const id = c.req.param("id")
  const channel = await unarchiveChannel(id)
  return c.json(channel)
})
