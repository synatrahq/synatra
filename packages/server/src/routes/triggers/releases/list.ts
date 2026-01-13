import { Hono } from "hono"
import { listTriggerReleases } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const list = new Hono().get("/:id/releases", requirePermission("trigger", "update"), async (c) => {
  const id = c.req.param("id")
  const releases = await listTriggerReleases(id)
  return c.json(releases)
})
