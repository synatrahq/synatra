import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { createRecipe, CreateRecipeSchema } from "@synatra/core"

export const create = new Hono().post("/", zValidator("json", CreateRecipeSchema), async (c) => {
  const recipe = await createRecipe(c.req.valid("json"))
  return c.json(recipe, 201)
})
