import { Hono } from "hono"
import { listRecipeReleases, getRecipeRelease } from "@synatra/core"

export const releases = new Hono()
  .get("/:id/releases", async (c) => {
    const recipeId = c.req.param("id")
    const releases = await listRecipeReleases(recipeId)
    return c.json(releases)
  })
  .get("/:id/releases/:releaseId", async (c) => {
    const recipeId = c.req.param("id")
    const releaseId = c.req.param("releaseId")
    const release = await getRecipeRelease(recipeId, releaseId)
    return c.json(release)
  })
