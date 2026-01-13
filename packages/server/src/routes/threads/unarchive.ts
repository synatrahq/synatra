import { Hono } from "hono"
import { getThreadById, unarchiveThread, principal, canAccessCurrentUserChannelMember } from "@synatra/core"
import { createError } from "@synatra/util/error"

export const unarchive = new Hono().post("/:id/unarchive", async (c) => {
  const id = c.req.param("id")
  const thread = await getThreadById(id)
  if (thread.channelId) {
    const hasAccess = await canAccessCurrentUserChannelMember(thread.channelId)
    if (!hasAccess) {
      throw createError("ForbiddenError", { message: "No access to this channel" })
    }
  } else if (thread.createdBy !== principal.userId()) {
    throw createError("ForbiddenError", { message: "No access to this thread" })
  }

  const updated = await unarchiveThread({ id })
  return c.json(updated)
})
