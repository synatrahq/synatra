import { Hono } from "hono"
import { getAgentById, getAgentCopilotThread } from "@synatra/core"
import { requireAuth, requireOrganization } from "../../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const get = new Hono().get("/:id/copilot/threads/:threadId", requireAuth, requireOrganization, async (c) => {
  const agentId = c.req.param("id")
  const threadId = c.req.param("threadId")

  await getAgentById(agentId)
  const result = await getAgentCopilotThread({ agentId, threadId })
  if (!result) throw createError("NotFoundError", { type: "CopilotThread", id: threadId })

  return c.json(result)
})
