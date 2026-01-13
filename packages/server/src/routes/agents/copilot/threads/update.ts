import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getAgentById, updateAgentCopilotThread } from "@synatra/core"
import { requireAuth, requireOrganization } from "../../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const update = new Hono().patch(
  "/:id/copilot/threads/:threadId",
  requireAuth,
  requireOrganization,
  zValidator("json", z.object({ title: z.string().min(1) })),
  async (c) => {
    const agentId = c.req.param("id")
    const threadId = c.req.param("threadId")
    const body = c.req.valid("json")

    await getAgentById(agentId)
    const thread = await updateAgentCopilotThread({ agentId, threadId, title: body.title })
    if (!thread) throw createError("NotFoundError", { type: "CopilotThread", id: threadId })

    return c.json({ thread })
  },
)
