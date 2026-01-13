import { Hono } from "hono"
import { getAgentById } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const id = c.req.param("id")
  const agent = await getAgentById(id)
  return c.json(agent)
})
