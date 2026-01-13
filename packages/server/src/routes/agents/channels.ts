import { Hono } from "hono"
import { getAgentById, listChannelAgentsByAgent } from "@synatra/core"

export const channels = new Hono().get("/:id/channels", async (c) => {
  const agentId = c.req.param("id")
  await getAgentById(agentId)
  const items = await listChannelAgentsByAgent(agentId)
  return c.json(items.map((item) => item.channelId))
})
