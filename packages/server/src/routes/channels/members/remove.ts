import { Hono } from "hono"
import { removeChannelMember } from "@synatra/core"
import { requireChannelOwner } from "../../../middleware/channel-owner"
import { createError } from "@synatra/util/error"

export const remove = new Hono().delete("/:channelId/members/:memberId", requireChannelOwner(), async (c) => {
  const channelId = c.req.param("channelId")
  const memberId = c.req.param("memberId")
  const result = await removeChannelMember({ channelId, memberId })
  if (!result) {
    throw createError("NotFoundError", { type: "ChannelMember", id: memberId })
  }
  return c.json({ success: true })
})
