import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { saveTriggerWorkingCopy, SaveTriggerWorkingCopySchema } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const saveWorkingCopy = new Hono().post(
  "/:id/working-copy/save",
  requirePermission("trigger", "update"),
  zValidator("json", SaveTriggerWorkingCopySchema.omit({ triggerId: true })),
  async (c) => {
    const result = await saveTriggerWorkingCopy({ triggerId: c.req.param("id"), ...c.req.valid("json") })
    return c.json(result)
  },
)
