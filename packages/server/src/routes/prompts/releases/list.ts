import { Hono } from "hono"
import { listPromptReleases } from "@synatra/core"

export const list = new Hono().get("/:id/releases", async (c) => {
  const promptId = c.req.param("id")
  const releases = await listPromptReleases(promptId)
  return c.json(releases)
})
