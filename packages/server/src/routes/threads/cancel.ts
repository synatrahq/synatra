import { Hono } from "hono"
import { getThreadById, updateThreadStatus, principal, canAccessCurrentUserChannelMember } from "@synatra/core"
import { createError } from "@synatra/util/error"

export const cancel = new Hono().post("/:id/cancel", async (c) => {
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

  try {
    const updated = await updateThreadStatus({ id, status: "cancelled" })
    return c.json(updated)
  } catch (error) {
    if (error instanceof Error) {
      throw createError("BadRequestError", { message: error.message })
    }
    throw error
  }
})
