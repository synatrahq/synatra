import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { deployRecipe, DeployRecipeSchema, adoptRecipe, checkoutRecipe } from "@synatra/core"

export const deploy = new Hono()
  .post("/:id/deploy", zValidator("json", DeployRecipeSchema.omit({ recipeId: true })), async (c) => {
    const recipeId = c.req.param("id")
    const body = c.req.valid("json")
    const release = await deployRecipe({ recipeId, ...body })
    return c.json(release, 201)
  })
  .post("/:id/releases/:releaseId/adopt", async (c) => {
    const recipeId = c.req.param("id")
    const releaseId = c.req.param("releaseId")
    const release = await adoptRecipe({ recipeId, releaseId })
    return c.json(release)
  })
  .post("/:id/releases/:releaseId/checkout", async (c) => {
    const recipeId = c.req.param("id")
    const releaseId = c.req.param("releaseId")
    const result = await checkoutRecipe({ recipeId, releaseId })
    return c.json(result)
  })
