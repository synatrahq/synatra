import { Hono } from "hono"
import { getAgentById, listAgentCopilotThreads } from "@synatra/core"
import { requireAuth, requireOrganization } from "../../../../middleware/principal"

export const list = new Hono().get("/:id/copilot/threads", requireAuth, requireOrganization, async (c) => {
  const agentId = c.req.param("id")
  await getAgentById(agentId)
  const threads = await listAgentCopilotThreads(agentId)
  return c.json({ threads })
})
