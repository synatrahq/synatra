import { Hono } from "hono"
import { getAgentById, removeAgentCopilotThread } from "@synatra/core"
import { requireAuth, requireOrganization } from "../../../../middleware/principal"

export const del = new Hono().delete("/:id/copilot/threads/:threadId", requireAuth, requireOrganization, async (c) => {
  const agentId = c.req.param("id")
  const threadId = c.req.param("threadId")
  await getAgentById(agentId)
  await removeAgentCopilotThread({ agentId, threadId })
  return c.json({ id: threadId, deleted: true })
})
