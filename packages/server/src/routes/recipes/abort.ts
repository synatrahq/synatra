import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { abortRecipeExecution, getRecipeById } from "@synatra/core"
import { createError } from "@synatra/util/error"

const schema = z.object({})

export const abort = new Hono().post("/:id/executions/:executionId/abort", zValidator("json", schema), async (c) => {
  const recipeId = c.req.param("id")
  const executionId = c.req.param("executionId")
  await getRecipeById(recipeId)

  const execution = await abortRecipeExecution({
    id: executionId,
    recipeId,
  })

  if (!execution.abortedAt) {
    throw createError("InternalError", { message: "Execution abort did not set a timestamp" })
  }

  return c.json({
    success: true,
    executionId,
    status: "aborted" as const,
    abortedAt: execution.abortedAt,
  })
})
