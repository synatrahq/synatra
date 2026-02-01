import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { updateRecipe, UpdateRecipeSchema } from "@synatra/core"

export const update = new Hono().patch("/:id", zValidator("json", UpdateRecipeSchema.omit({ id: true })), async (c) => {
  const id = c.req.param("id")
  const body = c.req.valid("json")
  const recipe = await updateRecipe({ id, ...body })
  return c.json(recipe)
})
