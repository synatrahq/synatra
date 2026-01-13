import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getAgentById, createAgentCopilotThread } from "@synatra/core"
import { requireAuth, requireOrganization } from "../../../../middleware/principal"

export const create = new Hono().post(
  "/:id/copilot/threads",
  requireAuth,
  requireOrganization,
  zValidator("json", z.object({ title: z.string().optional() })),
  async (c) => {
    const agentId = c.req.param("id")
    const body = c.req.valid("json")

    await getAgentById(agentId)
    const thread = await createAgentCopilotThread({ agentId, title: body.title })
    return c.json({ thread })
  },
)
