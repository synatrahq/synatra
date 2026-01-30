import { Hono } from "hono"
import { getRecipeById, findPendingExecution } from "@synatra/core"

export const pendingExecution = new Hono().get("/:id/pending-execution", async (c) => {
  const recipeId = c.req.param("id")
  await getRecipeById(recipeId)
  const execution = await findPendingExecution(recipeId)
  if (!execution) {
    return c.json(null)
  }
  return c.json({
    id: execution.id,
    recipeId: execution.recipeId,
    releaseId: execution.releaseId,
    environmentId: execution.environmentId,
    inputs: execution.inputs,
    currentStepKey: execution.currentStepKey,
    pendingInputConfig: execution.pendingInputConfig,
    results: execution.results,
    outputItemIds: execution.outputItemIds,
    createdBy: execution.createdBy,
    createdAt: execution.createdAt,
  })
})
