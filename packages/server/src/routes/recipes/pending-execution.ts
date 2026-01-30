import { Hono } from "hono"
import { getRecipeById, findPendingExecution } from "@synatra/core"

export const pendingExecution = new Hono().get("/:id/pending-execution", async (c) => {
  const recipeId = c.req.param("id")
  await getRecipeById(recipeId)
  const execution = await findPendingExecution(recipeId)
  return c.json(execution)
})
