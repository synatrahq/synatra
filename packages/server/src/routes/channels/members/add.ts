import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { AddChannelMemberSchema, addChannelMember } from "@synatra/core"
import { requireChannelOwner } from "../../../middleware/channel-owner"

export const add = new Hono().post(
  "/:channelId/members",
  requireChannelOwner(),
  zValidator("json", AddChannelMemberSchema.omit({ channelId: true })),
  async (c) => {
    const channelId = c.req.param("channelId")
    const body = c.req.valid("json")
    const members = await addChannelMember({ channelId, ...body })
    return c.json(members, 201)
  },
)
