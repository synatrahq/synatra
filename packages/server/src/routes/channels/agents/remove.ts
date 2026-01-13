import { Hono } from "hono"
import { removeChannelAgent } from "@synatra/core"
import { requireChannelOwner } from "../../../middleware/channel-owner"
import { createError } from "@synatra/util/error"

export const remove = new Hono().delete("/:channelId/agents/:agentId", requireChannelOwner(), async (c) => {
  const channelId = c.req.param("channelId")
  const agentId = c.req.param("agentId")
  const result = await removeChannelAgent({ channelId, agentId })
  if (!result) {
    throw createError("NotFoundError", { type: "ChannelAgent", id: agentId })
  }
  return c.json({ success: true })
})
