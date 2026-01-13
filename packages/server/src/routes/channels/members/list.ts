import { Hono } from "hono"
import { canAccessCurrentUserChannelMember, listChannelMembersByChannel } from "@synatra/core"
import { createError } from "@synatra/util/error"

export const list = new Hono().get("/:channelId/members", async (c) => {
  const channelId = c.req.param("channelId")
  const hasAccess = await canAccessCurrentUserChannelMember(channelId)
  if (!hasAccess) {
    throw createError("ForbiddenError", { message: "No access to this channel" })
  }
  const members = await listChannelMembersByChannel(channelId)
  return c.json(members)
})
