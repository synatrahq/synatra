import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getAgentById, getThreadById, findHumanRequestById, principal } from "@synatra/core"
import { playgroundHumanResponseSignal } from "@synatra/workflows"
import { getTemporalClient } from "../../../temporal"
import { createError } from "@synatra/util/error"

const approveSchema = z.object({
  comment: z.string().optional(),
  modifiedParams: z.record(z.string(), z.unknown()).optional(),
})

const rejectSchema = z.object({
  reason: z.string().optional(),
})

export const approvals = new Hono()
  .post("/:id/playground/approvals/:approvalId/approve", zValidator("json", approveSchema), async (c) => {
    const agentId = c.req.param("id")
    const approvalId = c.req.param("approvalId")
    const data = c.req.valid("json")
    const userId = principal.userId()

    await getAgentById(agentId)
    const humanRequest = await findHumanRequestById(approvalId)
    if (!humanRequest || humanRequest.kind !== "approval") {
      throw createError("NotFoundError", { type: "HumanRequest", id: approvalId })
    }

    const thread = await getThreadById(humanRequest.threadId)
    if (!thread || thread.agentId !== agentId || thread.userId !== userId) {
      throw createError("NotFoundError", { type: "Thread", id: humanRequest.threadId })
    }

    if (humanRequest.status !== "pending") {
      return c.json({
        alreadyDecided: true,
        approval: {
          id: humanRequest.id,
          status: humanRequest.status,
        },
      })
    }

    if (!thread.workflowId) {
      throw createError("BadRequestError", { message: "No active workflow for this session" })
    }

    const client = await getTemporalClient()
    const handle = client.workflow.getHandle(thread.workflowId)

    await handle.signal(playgroundHumanResponseSignal, {
      requestId: approvalId,
      status: "responded",
      respondedBy: userId,
      data: { approved: true, modifiedParams: data.modifiedParams, comment: data.comment },
    })

    return c.json({ success: true })
  })
  .post("/:id/playground/approvals/:approvalId/reject", zValidator("json", rejectSchema), async (c) => {
    const agentId = c.req.param("id")
    const approvalId = c.req.param("approvalId")
    const data = c.req.valid("json")
    const userId = principal.userId()

    await getAgentById(agentId)
    const humanRequest = await findHumanRequestById(approvalId)
    if (!humanRequest || humanRequest.kind !== "approval") {
      throw createError("NotFoundError", { type: "HumanRequest", id: approvalId })
    }

    const thread = await getThreadById(humanRequest.threadId)
    if (!thread || thread.agentId !== agentId || thread.userId !== userId) {
      throw createError("NotFoundError", { type: "Thread", id: humanRequest.threadId })
    }

    if (humanRequest.status !== "pending") {
      return c.json({
        alreadyDecided: true,
        approval: {
          id: humanRequest.id,
          status: humanRequest.status,
        },
      })
    }

    if (!thread.workflowId) {
      throw createError("BadRequestError", { message: "No active workflow for this session" })
    }

    const client = await getTemporalClient()
    const handle = client.workflow.getHandle(thread.workflowId)

    await handle.signal(playgroundHumanResponseSignal, {
      requestId: approvalId,
      status: "responded",
      respondedBy: userId,
      data: { approved: false, comment: data.reason },
    })

    return c.json({ success: true })
  })
