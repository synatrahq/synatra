import { Hono } from "hono"
import { getRecipeById, listRecipeExecutions } from "@synatra/core"

export const executions = new Hono().get("/:id/executions", async (c) => {
  const recipeId = c.req.param("id")
  await getRecipeById(recipeId)
  const result = await listRecipeExecutions({ recipeId })
  return c.json({
    items: result.items.map((e) => ({
      ...e,
      startedAt: e.createdAt,
    })),
    nextCursor: result.nextCursor,
  })
})
