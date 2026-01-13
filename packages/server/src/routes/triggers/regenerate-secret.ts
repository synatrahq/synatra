import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getTriggerById, regenerateTriggerWebhookSecret } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const regenerateSecret = new Hono().post(
  "/:id/regenerate-secret",
  requirePermission("trigger", "update"),
  zValidator("json", z.object({ environmentId: z.string() })),
  async (c) => {
    const id = c.req.param("id")
    const { environmentId } = c.req.valid("json")

    await getTriggerById(id)

    const updated = await regenerateTriggerWebhookSecret({ triggerId: id, environmentId })
    return c.json(updated)
  },
)
