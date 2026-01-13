import { Hono } from "hono"
import { canAccessCurrentUserChannelMember, listChannelAgentsByChannel } from "@synatra/core"
import { createError } from "@synatra/util/error"

export const list = new Hono().get("/:channelId/agents", async (c) => {
  const channelId = c.req.param("channelId")
  const hasAccess = await canAccessCurrentUserChannelMember(channelId)
  if (!hasAccess) {
    throw createError("ForbiddenError", { message: "No access to this channel" })
  }
  const agents = await listChannelAgentsByChannel(channelId)
  return c.json(agents)
})
