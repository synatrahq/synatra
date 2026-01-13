import { Hono } from "hono"
import { getChannelById, canAccessCurrentUserChannelMember } from "@synatra/core"
import { createError } from "@synatra/util/error"

export const get = new Hono().get("/:id", async (c) => {
  const id = c.req.param("id")

  const hasAccess = await canAccessCurrentUserChannelMember(id)
  if (!hasAccess) {
    throw createError("ForbiddenError", { message: "No access to this channel" })
  }

  const channel = await getChannelById(id)
  if (!channel) {
    throw createError("NotFoundError", { type: "Channel", id })
  }

  return c.json(channel)
})
