import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { UpdateChannelMemberRoleSchema, updateChannelMemberRole } from "@synatra/core"
import { requireChannelOwner } from "../../../middleware/channel-owner"
import { createError } from "@synatra/util/error"

export const updateRole = new Hono().patch(
  "/:channelId/members/:memberId",
  requireChannelOwner(),
  zValidator("json", UpdateChannelMemberRoleSchema.omit({ channelId: true, memberId: true })),
  async (c) => {
    const channelId = c.req.param("channelId")
    const memberId = c.req.param("memberId")
    const body = c.req.valid("json")
    const result = await updateChannelMemberRole({ channelId, memberId, ...body })
    if (!result) throw createError("NotFoundError", { type: "ChannelMember", id: memberId })
    return c.json(result)
  },
)
