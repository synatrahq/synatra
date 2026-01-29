import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  getRecipeById,
  getAgentById,
  listResources,
  respondToRecipeExecution,
  updateRecipeExecution,
  createOutputItemAndIncrementSeq,
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

    const { execution, response } = await respondToRecipeExecution({
      id: executionId,
      response: body.response,
    })

    if (execution.recipeId !== recipeId) {
      throw createError("BadRequestError", { message: "Execution does not belong to this recipe" })
    }

    const recipe = await getRecipeById(recipeId)
    const agent = await getAgentById(recipe.agentId)

    const allResources = await listResources()
    const resources = allResources.filter((r) => !isManagedResourceType(r.type))

    const config = loadConfig("server")
    const executor = createCodeExecutor(config)

    const sortedSteps = getStepExecutionOrder(recipe.steps)

    if (!execution.currentStepId) {
      throw createError("BadRequestError", { message: "Execution has no current step" })
    }

    const currentStepIndex = sortedSteps.findIndex((s) => s.id === execution.currentStepId)
    if (currentStepIndex === -1) {
      throw createError("BadRequestError", { message: "Current step not found" })
    }

    const stepResults = { ...(execution.results as Record<string, unknown>) }
    stepResults[execution.currentStepId] = response

    await updateRecipeExecution({ id: executionId, status: "running", pendingInputConfig: null })

    const runtimeConfig = agent.runtimeConfig as { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }

    const result = await executeStepLoop(
      sortedSteps,
      currentStepIndex + 1,
      {
        inputs: execution.inputs,
        results: stepResults,
        resolvedParams: { ...(execution.resolvedParams as Record<string, Record<string, unknown>>) },
      },
      [...execution.outputItemIds],
      {
        organizationId,
        environmentId: execution.environmentId,
        agentTools: runtimeConfig?.tools ?? [],
        resources: resources.map((r) => ({ slug: r.slug, id: r.id, type: r.type })),
        recipeOutputs: recipe.outputs,
        threadId: body.threadId,
        executeCode: (orgId, input) => executor.execute(orgId, input),
        createOutputItem: body.threadId ? (params) => createOutputItemAndIncrementSeq(params) : undefined,
      },
    )

    if (result.status === "waiting_input") {
      await updateRecipeExecution({
        id: executionId,
        status: "waiting_input",
        currentStepId: result.currentStepId,
        pendingInputConfig: result.pendingInputConfig,
        results: result.stepResults,
        resolvedParams: result.resolvedParams,
        outputItemIds: result.outputItemIds,
      })
      return c.json({
        executionId,
        ok: true,
        status: "waiting_input",
        currentStepId: result.currentStepId,
        pendingInputConfig: result.pendingInputConfig,
      })
    }

    if (result.status === "failed") {
      await updateRecipeExecution({
        id: executionId,
        status: "failed",
        currentStepId: result.currentStepId,
        error: result.error,
        results: result.stepResults,
        resolvedParams: result.resolvedParams,
      })
      return c.json({ executionId, ok: false, error: result.error })
    }

    await updateRecipeExecution({
      id: executionId,
      status: "completed",
      outputItemIds: result.outputItemIds,
      results: result.stepResults,
      resolvedParams: result.resolvedParams,
    })

    return c.json({ executionId, ok: true, outputItemIds: result.outputItemIds, stepResults: result.stepResults })
  },
)
