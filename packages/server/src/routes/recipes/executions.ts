import { Hono } from "hono"
import { listRecipeExecutions } from "@synatra/core"

export const executions = new Hono().get("/:id/executions", async (c) => {
  const recipeId = c.req.param("id")
  const result = await listRecipeExecutions({ recipeId })
  return c.json(
    result.items.map((e) => ({
      ...e,
      startedAt: e.createdAt,
    })),
  )
})
