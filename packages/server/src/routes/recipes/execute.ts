import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  createRecipeExecution,
  updateRecipeExecution,
  getRecipeById,
  getRecipeRelease,
  getAgentById,
  getAgentRelease,
  getEnvironmentById,
  listResources,
  createOutputItemAndIncrementSeq,
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
  threadId: z.string().optional(),
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
  }

  const agent = await getAgentById(recipe.agentId)
  await getEnvironmentById(body.environmentId)

  let agentRuntimeConfig: { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }
  if (release.agentVersionMode === "fixed" && release.agentReleaseId) {
    const agentRelease = await getAgentRelease(release.agentReleaseId)
    agentRuntimeConfig = agentRelease.runtimeConfig
  } else {
    agentRuntimeConfig = agent.runtimeConfig as { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }
  }

  const execution = await createRecipeExecution({
    recipeId,
    releaseId,
    environmentId: body.environmentId,
    inputs: body.inputs,
  })

  await updateRecipeExecution({ id: execution.id, status: "running" })

  const allResources = await listResources()
  const resources = allResources.filter((r) => !isManagedResourceType(r.type))

  const config = loadConfig("server")
  const executor = createCodeExecutor(config)

  const normalizedSteps = buildNormalizedSteps(release.steps, release.edges)
  const sortedSteps = getStepExecutionOrder(normalizedSteps)

  const result = await executeStepLoop(sortedSteps, 0, { inputs: body.inputs, results: {}, resolvedParams: {} }, [], {
    organizationId,
    environmentId: body.environmentId,
    agentTools: agentRuntimeConfig?.tools ?? [],
    resources: resources.map((r) => ({ slug: r.slug, id: r.id, type: r.type })),
    recipeOutputs: release.outputs,
    threadId: body.threadId,
    executeCode: (orgId, input) => executor.execute(orgId, input),
    createOutputItem: body.threadId ? (params) => createOutputItemAndIncrementSeq(params) : undefined,
  })

  if (result.status === "waiting_input") {
    await updateRecipeExecution({
      id: execution.id,
      status: "waiting_input",
      currentStepKey: result.currentStepKey,
      pendingInputConfig: result.pendingInputConfig,
      results: result.stepResults,
      resolvedParams: result.resolvedParams,
      outputItemIds: result.outputItemIds,
    })
    return c.json({
      executionId: execution.id,
      ok: true,
      status: "waiting_input",
      currentStepKey: result.currentStepKey,
      pendingInputConfig: result.pendingInputConfig,
    })
  }

  if (result.status === "failed") {
    await updateRecipeExecution({
      id: execution.id,
      status: "failed",
      currentStepKey: result.currentStepKey,
      error: { stepId: result.error.stepKey, toolName: result.error.toolName, message: result.error.message },
      results: result.stepResults,
      resolvedParams: result.resolvedParams,
    })
    return c.json({ executionId: execution.id, ok: false, error: result.error })
  }

  await updateRecipeExecution({
    id: execution.id,
    status: "completed",
    outputItemIds: result.outputItemIds,
    results: result.stepResults,
    resolvedParams: result.resolvedParams,
  })

  return c.json({
    executionId: execution.id,
    ok: true,
    outputItemIds: result.outputItemIds,
    stepResults: result.stepResults,
  })
})
