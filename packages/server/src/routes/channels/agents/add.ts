import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { AddChannelAgentSchema, addChannelAgent } from "@synatra/core"
import { requireChannelOwner } from "../../../middleware/channel-owner"

export const add = new Hono().post(
  "/:channelId/agents",
  requireChannelOwner(),
  zValidator("json", AddChannelAgentSchema.omit({ channelId: true })),
  async (c) => {
    const channelId = c.req.param("channelId")
    const body = c.req.valid("json")
    const agents = await addChannelAgent({ channelId, ...body })
    return c.json(agents, 201)
  },
)
