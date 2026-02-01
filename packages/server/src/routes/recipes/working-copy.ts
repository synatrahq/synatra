import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { getRecipeWorkingCopy, saveRecipeWorkingCopy, SaveRecipeWorkingCopySchema } from "@synatra/core"

export const workingCopy = new Hono()
  .get("/:id/working-copy", async (c) => {
    const recipeId = c.req.param("id")
    const workingCopy = await getRecipeWorkingCopy(recipeId)
    return c.json(workingCopy)
  })
  .patch("/:id/working-copy", zValidator("json", SaveRecipeWorkingCopySchema.omit({ recipeId: true })), async (c) => {
    const recipeId = c.req.param("id")
    const body = c.req.valid("json")
    const result = await saveRecipeWorkingCopy({ recipeId, ...body })
    return c.json(result)
  })
