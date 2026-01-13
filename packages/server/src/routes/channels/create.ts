import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { createChannel, CreateChannelSchema } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const create = new Hono().post(
  "/",
  requirePermission("channel", "create"),
  zValidator("json", CreateChannelSchema),
  async (c) => {
    const body = c.req.valid("json")
    const channel = await createChannel(body)
    return c.json(channel, 201)
  },
)
