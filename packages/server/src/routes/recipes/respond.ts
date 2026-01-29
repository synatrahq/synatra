import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  getRecipeById,
  getRecipeRelease,
  getRecipeExecutionById,
  getAgentById,
  getAgentRelease,
  listResources,
  respondToRecipeExecution,
  updateRecipeExecution,
  deleteRecipeExecution,
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
  response: z.record(z.string(), z.unknown()),
  environmentId: z.string().optional(),
  threadId: z.string().optional(),
})

export const respond = new Hono().post(
  "/:id/executions/:executionId/respond",
  zValidator("json", schema),
  async (c) => {
    const recipeId = c.req.param("id")
    const executionId = c.req.param("executionId")
    const body = c.req.valid("json")
    const organizationId = principal.orgId()

    const existingExecution = await getRecipeExecutionById(executionId)
    if (existingExecution.recipeId !== recipeId) {
      throw createError("BadRequestError", { message: "Execution does not belong to this recipe" })
    }

    const { execution, response } = await respondToRecipeExecution({
      id: executionId,
      response: body.response,
    })

    const recipe = await getRecipeById(recipeId)
    const release = await getRecipeRelease(recipeId, execution.releaseId)
    const agent = await getAgentById(recipe.agentId)

    let agentRuntimeConfig: { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }
    if (release.agentVersionMode === "fixed" && release.agentReleaseId) {
      const agentRelease = await getAgentRelease(release.agentReleaseId)
      agentRuntimeConfig = agentRelease.runtimeConfig
    } else {
      agentRuntimeConfig = agent.runtimeConfig as { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }
    }

    const allResources = await listResources()
    const resources = allResources.filter((r) => !isManagedResourceType(r.type))

    const config = loadConfig("server")
    const executor = createCodeExecutor(config)

    const normalizedSteps = buildNormalizedSteps(release.steps, release.edges)
    const sortedSteps = getStepExecutionOrder(normalizedSteps)

    if (!execution.currentStepKey) {
      throw createError("BadRequestError", { message: "Execution has no current step" })
    }

    const currentStepIndex = sortedSteps.findIndex((s) => s.stepKey === execution.currentStepKey)
    if (currentStepIndex === -1) {
      throw createError("BadRequestError", { message: "Current step not found" })
    }

    const stepResults = { ...(execution.results as Record<string, unknown>) }
    stepResults[execution.currentStepKey] = response

    await updateRecipeExecution({ id: executionId, pendingInputConfig: null })

    const result = await executeStepLoop(
      sortedSteps,
      currentStepIndex + 1,
      {
        inputs: execution.inputs,
        results: stepResults,
        resolvedParams: {},
      },
      [...execution.outputItemIds],
      {
        organizationId,
        environmentId: execution.environmentId,
        agentTools: agentRuntimeConfig?.tools ?? [],
        resources: resources.map((r) => ({ slug: r.slug, id: r.id, type: r.type })),
        recipeOutputs: release.outputs,
        threadId: body.threadId,
        executeCode: (orgId, input) => executor.execute(orgId, input),
        createOutputItem: body.threadId ? (params) => createOutputItemAndIncrementSeq(params) : undefined,
      },
    )

    if (result.status === "waiting_input") {
      await updateRecipeExecution({
        id: executionId,
        currentStepKey: result.currentStepKey,
        pendingInputConfig: result.pendingInputConfig,
        results: result.stepResults,
        outputItemIds: result.outputItemIds,
      })
      return c.json({
        executionId,
        ok: true,
        status: "waiting_input" as const,
        currentStepKey: result.currentStepKey,
        pendingInputConfig: result.pendingInputConfig,
      })
    }

    await deleteRecipeExecution(executionId)

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
      outputItemIds: result.outputItemIds,
      stepResults: result.stepResults,
      resolvedParams: result.resolvedParams,
    })
  },
)
