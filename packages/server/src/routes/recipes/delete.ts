import { Hono } from "hono"
import { deleteRecipe } from "@synatra/core"

export const del = new Hono().delete("/:id", async (c) => {
  const id = c.req.param("id")
  await deleteRecipe({ id })
  return c.json({ id, deleted: true })
})
