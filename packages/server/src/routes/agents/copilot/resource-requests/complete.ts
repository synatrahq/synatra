import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { getAgentById, completeAgentCopilotResourceRequest } from "@synatra/core"
import { requirePermission } from "../../../../middleware/principal"
import { emitCopilotEvent } from "../threads/stream"
import { createError } from "@synatra/util/error"

const schema = z.object({
  resourceId: z.uuid(),
  resourceSlug: z.string(),
})

export const complete = new Hono().post(
  "/:id/copilot/resource-requests/:requestId/complete",
  requirePermission("agent", "update"),
  zValidator("json", schema),
  async (c) => {
    const agentId = c.req.param("id")
    const requestId = c.req.param("requestId")
    const body = c.req.valid("json")

    await getAgentById(agentId)
    const result = await completeAgentCopilotResourceRequest({
      agentId,
      requestId,
      resourceId: body.resourceId,
    })
    if (!result) throw createError("NotFoundError", { type: "CopilotResourceRequest", id: requestId })

    if (!result.alreadyDecided) {
      await emitCopilotEvent({
        threadId: result.thread.id,
        seq: result.seq,
        type: "copilot.resource_request.completed",
        data: {
          resourceRequest: result.request,
          resourceId: body.resourceId,
          resourceSlug: body.resourceSlug,
        },
      })
    }

    return c.json({ success: true, request: result.request, alreadyDecided: result.alreadyDecided })
  },
)
