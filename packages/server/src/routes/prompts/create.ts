import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { createPrompt, CreatePromptSchema, getAgentById } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const create = new Hono().post(
  "/",
  requirePermission("prompt", "create"),
  zValidator("json", CreatePromptSchema),
  async (c) => {
    const body = c.req.valid("json")
    await getAgentById(body.agentId)
    const prompt = await createPrompt(body)
    return c.json(prompt, 201)
  },
)
