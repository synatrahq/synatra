import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  principal,
  getThreadById,
  findHumanRequestById,
  findRunById,
  canAccessCurrentUserChannelMember,
  getCurrentChannelMember,
  findChannelMemberByChannelAndMember,
} from "@synatra/core"
import { humanResponseSignal } from "@synatra/workflows"
import { getTemporalClient } from "../../temporal"
import { createError } from "@synatra/util/error"

const schema = z.object({
  status: z.enum(["responded", "cancelled", "skipped"]),
  data: z.unknown().optional(),
})

export const respondHumanRequest = new Hono().post(
  "/:threadId/human-requests/:requestId/respond",
  zValidator("json", schema),
  async (c) => {
    const threadId = c.req.param("threadId")
    const requestId = c.req.param("requestId")
    const body = c.req.valid("json")
    const userId = principal.userId()

    const humanRequest = await findHumanRequestById(requestId)
    if (!humanRequest) {
      throw createError("NotFoundError", { type: "HumanRequest", id: requestId })
    }

    if (humanRequest.threadId !== threadId) {
      throw createError("NotFoundError", { type: "HumanRequest", id: requestId })
    }

    const thread = await getThreadById(threadId)
    if (thread.channelId) {
      const hasAccess = await canAccessCurrentUserChannelMember(thread.channelId)
      if (!hasAccess) {
        throw createError("ForbiddenError", { message: "No access to this channel" })
      }
    } else if (thread.createdBy !== principal.userId()) {
      throw createError("ForbiddenError", { message: "No access to this thread" })
    }

    if (humanRequest.status !== "pending") {
      throw createError("BadRequestError", { message: "Human request is not pending" })
    }

    if (humanRequest.authority === "owner_only" && thread.channelId) {
      const member = await getCurrentChannelMember()
      if (!member) {
        throw createError("ForbiddenError", { message: "Member not found" })
      }

      const channelMember = await findChannelMemberByChannelAndMember({
        channelId: thread.channelId,
        memberId: member.id,
      })

      if (!channelMember || channelMember.role !== "owner") {
        throw createError("ForbiddenError", { message: "Only channel owners can respond to this request" })
      }
    }

    try {
      const client = await getTemporalClient()

      let workflowId = thread.workflowId
      if (humanRequest.runId) {
        const run = await findRunById(humanRequest.runId)
        if (run?.parentRunId) {
          workflowId = `subagent-${humanRequest.runId}`
        }
      }

      const handle = client.workflow.getHandle(workflowId)

      await handle.signal(humanResponseSignal, {
        requestId,
        status: body.status,
        respondedBy: userId,
        data: body.data,
      })

      return c.json({ success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to respond"
      throw createError("BadRequestError", { message })
    }
  },
)
