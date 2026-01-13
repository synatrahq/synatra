import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { deployAgent, DeployAgentSchema } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const deploy = new Hono().post(
  "/:id/deploy",
  requirePermission("agent", "update"),
  zValidator("json", DeployAgentSchema.omit({ agentId: true })),
  async (c) => {
    const agentId = c.req.param("id")
    const body = c.req.valid("json")
    const release = await deployAgent({ agentId, ...body })
    return c.json(release, 201)
  },
)
