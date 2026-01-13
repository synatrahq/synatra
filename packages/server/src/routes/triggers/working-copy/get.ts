import { Hono } from "hono"
import { getTriggerWorkingCopy } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const getWorkingCopy = new Hono().get("/:id/working-copy", requirePermission("trigger", "update"), async (c) => {
  const id = c.req.param("id")
  const workingCopy = await getTriggerWorkingCopy(id)
  return c.json(workingCopy)
})
