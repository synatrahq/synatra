import { Hono } from "hono"
import { getAgentById, cancelAgentCopilotResourceRequest } from "@synatra/core"
import { requirePermission } from "../../../../middleware/principal"
import { emitCopilotEvent } from "../threads/stream"
import { createError } from "@synatra/util/error"

export const cancel = new Hono().post(
  "/:id/copilot/resource-requests/:requestId/cancel",
  requirePermission("agent", "update"),
  async (c) => {
    const agentId = c.req.param("id")
    const requestId = c.req.param("requestId")

    await getAgentById(agentId)
    const result = await cancelAgentCopilotResourceRequest({ agentId, requestId })
    if (!result) throw createError("NotFoundError", { type: "CopilotResourceRequest", id: requestId })

    if (!result.alreadyDecided) {
      await emitCopilotEvent({
        threadId: result.thread.id,
        seq: result.seq,
        type: "copilot.resource_request.cancelled",
        data: { resourceRequest: result.request },
      })
    }

    return c.json({ success: true, request: result.request, alreadyDecided: result.alreadyDecided })
  },
)
