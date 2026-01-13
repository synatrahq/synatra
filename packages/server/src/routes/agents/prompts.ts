import { Hono } from "hono"
import { getAgentById, listPromptsByAgent } from "@synatra/core"

export const prompts = new Hono().get("/:id/prompts", async (c) => {
  const agentId = c.req.param("id")
  await getAgentById(agentId)
  const items = await listPromptsByAgent(agentId)
  return c.json(items)
})
