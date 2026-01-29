import { Hono } from "hono"
import { getRecipeById, listRecipeExecutions } from "@synatra/core"

export const executions = new Hono().get("/:id/executions", async (c) => {
  const recipeId = c.req.param("id")
  await getRecipeById(recipeId)
  const result = await listRecipeExecutions({ recipeId })
  return c.json({
    items: result.items.map((e) => ({
      id: e.id,
      recipeId: e.recipeId,
      releaseId: e.releaseId,
      environmentId: e.environmentId,
      inputs: e.inputs,
      currentStepKey: e.currentStepKey,
      pendingInputConfig: e.pendingInputConfig,
      results: e.results,
      outputItemIds: e.outputItemIds,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
      startedAt: e.createdAt,
    })),
    nextCursor: result.nextCursor,
  })
})
