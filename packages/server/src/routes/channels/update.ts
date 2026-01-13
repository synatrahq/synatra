import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { updateChannel, UpdateChannelSchema } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const update = new Hono().patch(
  "/:id",
  requirePermission("channel", "update"),
  zValidator("json", UpdateChannelSchema.omit({ id: true })),
  async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const channel = await updateChannel({ id, ...body })
    return c.json(channel)
  },
)
