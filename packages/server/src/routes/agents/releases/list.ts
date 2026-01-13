import { Hono } from "hono"
import { listAgentReleases } from "@synatra/core"

export const list = new Hono().get("/:id/releases", async (c) => {
  const agentId = c.req.param("id")
  const releases = await listAgentReleases(agentId)
  return c.json(releases)
})
