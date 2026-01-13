import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { createAgent, CreateAgentSchema } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const create = new Hono().post(
  "/",
  requirePermission("agent", "create"),
  zValidator("json", CreateAgentSchema),
  async (c) => {
    const body = c.req.valid("json")
    const agent = await createAgent(body)
    return c.json(agent, 201)
  },
)
