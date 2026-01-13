import { Hono } from "hono"
import { getPromptWorkingCopy } from "@synatra/core"

export const getWorkingCopy = new Hono().get("/:id/working-copy", async (c) => {
  const id = c.req.param("id")
  const copy = await getPromptWorkingCopy(id)
  return c.json(copy ?? null)
})
