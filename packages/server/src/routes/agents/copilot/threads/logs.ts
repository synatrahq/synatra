import { Hono } from "hono"
import { getAgentById, listAgentCopilotToolLogs } from "@synatra/core"
import { requirePermission } from "../../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const logs = new Hono().get(
  "/:id/copilot/threads/:threadId/logs",
  requirePermission("agent", "update"),
  async (c) => {
    const agentId = c.req.param("id")
    const threadId = c.req.param("threadId")

    await getAgentById(agentId)
    const logs = await listAgentCopilotToolLogs({ agentId, threadId })
    if (!logs) throw createError("NotFoundError", { type: "CopilotThread", id: threadId })

    return c.json({
      logs: logs.map((log) => ({
        id: log.id,
        toolName: log.toolName,
        toolCallId: log.toolCallId,
        status: log.status,
        latencyMs: log.latencyMs,
        error: log.error,
        payload: log.payload,
        createdAt: log.createdAt.toISOString(),
      })),
    })
  },
)
