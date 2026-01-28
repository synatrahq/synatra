import { Hono } from "hono"
import { getRecipeById } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const recipe = await getRecipeById(c.req.param("id"))
  return c.json(recipe)
})
