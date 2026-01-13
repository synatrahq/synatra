import { Hono } from "hono"
import { getPromptByIdWithAgent } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const id = c.req.param("id")
  const prompt = await getPromptByIdWithAgent(id)
  return c.json(prompt)
})
