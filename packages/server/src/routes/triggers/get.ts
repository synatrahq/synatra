import { Hono } from "hono"
import { getTriggerById, listTriggerEnvironments, findPromptById, findAgentById } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const id = c.req.param("id")
  const trigger = await getTriggerById(id)
  const agent = trigger.agentId ? await findAgentById(trigger.agentId) : null
  const prompt = trigger.promptId ? await findPromptById(trigger.promptId) : null
  const environments = await listTriggerEnvironments(id)

  return c.json({
    ...trigger,
    environments,
    agent: agent
      ? {
          id: agent.id,
          name: agent.name,
          slug: agent.slug,
          icon: agent.icon,
          iconColor: agent.iconColor,
        }
      : null,
    prompt: prompt
      ? {
          id: prompt.id,
          name: prompt.name,
          slug: prompt.slug,
          inputSchema: prompt.inputSchema,
        }
      : null,
  })
})
