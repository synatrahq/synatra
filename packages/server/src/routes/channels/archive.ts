import { Hono } from "hono"
import { archiveChannel } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const archive = new Hono().post("/:id/archive", requirePermission("channel", "delete"), async (c) => {
  const id = c.req.param("id")
  const channel = await archiveChannel(id)
  return c.json(channel)
})
