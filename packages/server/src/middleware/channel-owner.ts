import { createMiddleware } from "hono/factory"
import { withDb, MemberTable, ChannelMemberTable, ChannelTable, eq, and } from "@synatra/core"
import { auth } from "../auth"
import { createError } from "@synatra/util/error"

export function requireChannelOwner(paramName = "channelId") {
  return createMiddleware(async (c, next) => {
    const channelId = c.req.param(paramName)
    if (!channelId) {
      throw createError("ForbiddenError", { message: "Channel ID required" })
    }

    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    const organizationId = (session?.session as any)?.activeOrganizationId
    const userId = session?.user?.id

    if (!userId || !organizationId) {
      throw createError("ForbiddenError", { message: "Authentication required" })
    }

    const channel = await withDb((db) =>
      db
        .select()
        .from(ChannelTable)
        .where(eq(ChannelTable.id, channelId))
        .then((rows) => rows[0]),
    )

    if (!channel || channel.organizationId !== organizationId) {
      throw createError("ForbiddenError", { message: "Channel not found" })
    }

    const member = await withDb((db) =>
      db
        .select()
        .from(MemberTable)
        .where(and(eq(MemberTable.userId, userId), eq(MemberTable.organizationId, organizationId)))
        .then((rows) => rows[0]),
    )

    if (!member) {
      throw createError("ForbiddenError", { message: "Not a member of this organization" })
    }

    if (member.role === "owner" || member.role === "admin") {
      return next()
    }

    const channelMember = await withDb((db) =>
      db
        .select()
        .from(ChannelMemberTable)
        .where(and(eq(ChannelMemberTable.channelId, channelId), eq(ChannelMemberTable.memberId, member.id)))
        .then((rows) => rows[0]),
    )

    if (channelMember?.role === "owner") {
      return next()
    }

    throw createError("ForbiddenError", { message: "Channel owner permission required" })
  })
}
