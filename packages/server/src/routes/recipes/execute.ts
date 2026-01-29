import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  createRecipeExecution,
  updateRecipeExecution,
  getRecipeById,
  getAgentById,
  getEnvironmentById,
  listResources,
  createOutputItemAndIncrementSeq,
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
  threadId: z.string().optional(),
})

export const execute = new Hono().post("/:id/execute", zValidator("json", schema), async (c) => {
  const recipeId = c.req.param("id")
  const body = c.req.valid("json")
  const organizationId = principal.orgId()

  const recipe = await getRecipeById(recipeId)

  for (const input of recipe.inputs) {
    if (input.required && !(input.key in body.inputs)) {
      throw createError("BadRequestError", { message: `Missing required input: ${input.key}` })
    }
  }

  const agent = await getAgentById(recipe.agentId)
  await getEnvironmentById(body.environmentId)

  const execution = await createRecipeExecution({
    recipeId,
    environmentId: body.environmentId,
    inputs: body.inputs,
  })

  await updateRecipeExecution({ id: execution.id, status: "running" })

  const allResources = await listResources()
  const resources = allResources.filter((r) => !isManagedResourceType(r.type))

  const config = loadConfig("server")
  const executor = createCodeExecutor(config)

  const sortedSteps = getStepExecutionOrder(recipe.steps)
  const runtimeConfig = agent.runtimeConfig as { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }

  const result = await executeStepLoop(sortedSteps, 0, { inputs: body.inputs, results: {}, resolvedParams: {} }, [], {
    organizationId,
    environmentId: body.environmentId,
    agentTools: runtimeConfig?.tools ?? [],
    resources: resources.map((r) => ({ slug: r.slug, id: r.id, type: r.type })),
    recipeOutputs: recipe.outputs,
    threadId: body.threadId,
    executeCode: (orgId, input) => executor.execute(orgId, input),
    createOutputItem: body.threadId ? (params) => createOutputItemAndIncrementSeq(params) : undefined,
  })

  if (result.status === "waiting_input") {
    await updateRecipeExecution({
      id: execution.id,
      status: "waiting_input",
      currentStepId: result.currentStepId,
      pendingInputConfig: result.pendingInputConfig,
      results: result.stepResults,
      resolvedParams: result.resolvedParams,
      outputItemIds: result.outputItemIds,
    })
    return c.json({
      executionId: execution.id,
      ok: true,
      status: "waiting_input",
      currentStepId: result.currentStepId,
      pendingInputConfig: result.pendingInputConfig,
    })
  }

  if (result.status === "failed") {
    await updateRecipeExecution({
      id: execution.id,
      status: "failed",
      currentStepId: result.currentStepId,
      error: result.error,
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
