import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { principal, getAgentById, getThreadById, findHumanRequestById, findRunById } from "@synatra/core"
import { playgroundHumanResponseSignal, humanResponseSignal } from "@synatra/workflows"
import { getTemporalClient } from "../../../temporal"
import { createError } from "@synatra/util/error"

const respondSchema = z.object({
  status: z.enum(["responded", "cancelled", "skipped"]),
  data: z.unknown().optional(),
})

export const humanRequests = new Hono().post(
  "/:id/playground/human-requests/:requestId/respond",
  zValidator("json", respondSchema),
  async (c) => {
    const agentId = c.req.param("id")
    const requestId = c.req.param("requestId")
    const { status, data } = c.req.valid("json")
    const userId = principal.userId()

    await getAgentById(agentId)
    const humanRequest = await findHumanRequestById(requestId)
    if (!humanRequest) {
      throw createError("NotFoundError", { type: "HumanRequest", id: requestId })
    }

    const thread = await getThreadById(humanRequest.threadId)
    if (thread.agentId !== agentId || thread.userId !== userId) {
      throw createError("NotFoundError", { type: "Thread", id: humanRequest.threadId })
    }

    if (!thread.workflowId) {
      throw createError("BadRequestError", { message: "No active workflow for this session" })
    }

    try {
      const client = await getTemporalClient()

      let workflowId = thread.workflowId
      let isSubagent = false
      if (humanRequest.runId) {
        const run = await findRunById(humanRequest.runId)
        if (run?.parentRunId) {
          workflowId = `subagent-${humanRequest.runId}`
          isSubagent = true
        }
      }

      const handle = client.workflow.getHandle(workflowId)

      if (isSubagent) {
        await handle.signal(humanResponseSignal, {
          requestId,
          status,
          respondedBy: userId,
          data,
        })
      } else {
        await handle.signal(playgroundHumanResponseSignal, {
          requestId,
          status,
          respondedBy: userId,
          data,
        })
      }

      return c.json({ success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to respond"
      throw createError("BadRequestError", { message })
    }
  },
)
