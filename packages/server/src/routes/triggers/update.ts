import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { updateTrigger, UpdateTriggerSchema } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const update = new Hono().patch(
  "/:id",
  requirePermission("trigger", "update"),
  zValidator("json", UpdateTriggerSchema.omit({ id: true })),
  async (c) => {
    const trigger = await updateTrigger({ id: c.req.param("id"), ...c.req.valid("json") })
    return c.json(trigger)
  },
)
