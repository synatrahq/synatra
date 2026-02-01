import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  createRecipeExecution,
  updateRecipeExecution,
  deleteRecipeExecution,
  getRecipeById,
  getRecipeRelease,
  getEnvironmentById,
  listResources,
  buildNormalizedSteps,
  getStepExecutionOrder,
  executeStepLoop,
} from "@synatra/core"
import { isManagedResourceType } from "@synatra/core/types"
import { loadConfig, createCodeExecutor } from "@synatra/service-call"
import { principal } from "@synatra/core"
import { createError } from "@synatra/util/error"

const schema = z.object({
  inputs: z.record(z.string(), z.unknown()).default({}),
  environmentId: z.string(),
  releaseId: z.string().optional(),
})

export const execute = new Hono().post("/:id/execute", zValidator("json", schema), async (c) => {
  const recipeId = c.req.param("id")
  const body = c.req.valid("json")
  const organizationId = principal.orgId()

  const recipe = await getRecipeById(recipeId)
  const releaseId = body.releaseId ?? recipe.currentReleaseId

  if (!releaseId) {
    throw createError("BadRequestError", { message: "Recipe has no current release" })
  }

  const release = await getRecipeRelease(recipeId, releaseId)

  for (const input of release.inputs) {
    if (input.required && !(input.key in body.inputs)) {
      throw createError("BadRequestError", { message: `Missing required input: ${input.key}` })
    }
    if (input.key in body.inputs) {
      const value = body.inputs[input.key]
      if (value !== null && value !== undefined && value !== "") {
        switch (input.type) {
          case "string":
            if (typeof value !== "string") {
              throw createError("BadRequestError", { message: `Input "${input.key}" must be a string` })
            }
            break
          case "number":
            if (typeof value !== "number") {
              throw createError("BadRequestError", { message: `Input "${input.key}" must be a number` })
            }
            break
        }
      }
    }
  }

  await getEnvironmentById(body.environmentId)

  const execution = await createRecipeExecution({
    recipeId,
    releaseId,
    environmentId: body.environmentId,
    inputs: body.inputs,
  })

  const allResources = await listResources()
  const resources = allResources.filter((r) => !isManagedResourceType(r.type))

  const config = loadConfig("server")
  const executor = createCodeExecutor(config)

  const normalizedSteps = buildNormalizedSteps(release.steps)
  const sortedSteps = getStepExecutionOrder(normalizedSteps)

  const result = await executeStepLoop(
    sortedSteps,
    0,
    { inputs: body.inputs, results: {}, resolvedParams: {} },
    {
      organizationId,
      environmentId: body.environmentId,
      resources: resources.map((r) => ({ slug: r.slug, id: r.id, type: r.type })),
      executeCode: (orgId, input) => executor.execute(orgId, input),
    },
  )

  if (result.status === "waiting_input") {
    await updateRecipeExecution({
      id: execution.id,
      currentStepKey: result.currentStepKey,
      pendingInputConfig: result.pendingInputConfig,
      results: result.stepResults,
      status: "waiting_input",
    })
    return c.json({
      executionId: execution.id,
      ok: true,
      status: "waiting_input" as const,
      currentStepKey: result.currentStepKey,
      pendingInputConfig: result.pendingInputConfig,
    })
  }

  await deleteRecipeExecution(execution.id)

  if (result.status === "failed") {
    return c.json({
      ok: false,
      status: "failed" as const,
      error: result.error,
      stepResults: result.stepResults,
      resolvedParams: result.resolvedParams,
    })
  }

  return c.json({
    ok: true,
    status: "completed" as const,
    stepResults: result.stepResults,
    resolvedParams: result.resolvedParams,
  })
})
