import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { createTrigger, CreateTriggerSchema, getAgentById } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const create = new Hono().post(
  "/",
  requirePermission("trigger", "create"),
  zValidator("json", CreateTriggerSchema),
  async (c) => {
    const body = c.req.valid("json")
    await getAgentById(body.agentId)
    const trigger = await createTrigger(body)
    return c.json(trigger, 201)
  },
)
