import { Hono } from "hono"
import { getAgentWorkingCopy } from "@synatra/core"

export const getWorkingCopy = new Hono().get("/:id/working-copy", async (c) => {
  const id = c.req.param("id")
  const copy = await getAgentWorkingCopy(id)
  return c.json(copy ?? null)
})
