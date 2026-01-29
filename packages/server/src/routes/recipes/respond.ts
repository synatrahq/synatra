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
  resolveStepParams,
  getStepExecutionOrder,
  isHumanInputStep,
  buildPendingInputConfig,
} from "@synatra/core"
import { isManagedResourceType } from "@synatra/core/types"
import { isOutputTool, isComputeTool } from "@synatra/core/system-tools"
import { loadConfig, createCodeExecutor } from "@synatra/service-call"
import { principal } from "@synatra/core"
import { toErrorMessage, createError } from "@synatra/util/error"

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
    const stepResults = { ...(execution.results as Record<string, unknown>) }
    const resolvedParams = { ...(execution.resolvedParams as Record<string, Record<string, unknown>>) }
    const outputItemIds = [...execution.outputItemIds]

    if (!execution.currentStepId) {
      throw createError("BadRequestError", { message: "Execution has no current step" })
    }

    const currentStepIndex = sortedSteps.findIndex((s) => s.id === execution.currentStepId)
    if (currentStepIndex === -1) {
      throw createError("BadRequestError", { message: "Current step not found" })
    }

    stepResults[execution.currentStepId] = response
    await updateRecipeExecution({ id: executionId, status: "running", pendingInputConfig: null })

    const context = {
      inputs: execution.inputs,
      results: stepResults,
      resolvedParams,
    }

    for (let i = currentStepIndex + 1; i < sortedSteps.length; i++) {
      const step = sortedSteps[i]
      const params = resolveStepParams(step, context)
      resolvedParams[step.id] = params

      if (isHumanInputStep(step)) {
        const pendingInputConfig = buildPendingInputConfig(step, params)
        await updateRecipeExecution({
          id: executionId,
          status: "waiting_input",
          currentStepId: step.id,
          pendingInputConfig,
          results: stepResults,
          resolvedParams,
          outputItemIds,
        })
        return c.json({
          executionId,
          ok: true,
          status: "waiting_input",
          currentStepId: step.id,
          pendingInputConfig,
        })
      }

      if (isOutputTool(step.toolName)) {
        stepResults[step.id] = params
        if (body.threadId) {
          const output = recipe.outputs.find((o) => o.stepId === step.id)
          if (output) {
            const { item } = await createOutputItemAndIncrementSeq({
              threadId: body.threadId,
              kind: output.kind,
              name: output.name,
              payload: params as Record<string, unknown>,
            })
            outputItemIds.push(item.id)
          }
        }
        continue
      }

      if (isComputeTool(step.toolName)) {
        const code = params.code as string
        const input = params.input as Record<string, unknown> | undefined
        const timeout =
          typeof params.timeout === "number" && params.timeout >= 100 && params.timeout <= 30000
            ? params.timeout
            : 10000

        const result = await executor.execute(organizationId, {
          code,
          params: input ?? {},
          paramAlias: input !== undefined ? "input" : undefined,
          context: { resources: [] },
          environmentId: execution.environmentId,
          timeout,
        })

        if (!result.ok || !result.data.success) {
          const baseError = !result.ok
            ? toErrorMessage(result.error)
            : (result.data.error ?? "Compute execution failed")
          const error = `Step "${step.id}" (${step.toolName}): ${baseError}`
          await updateRecipeExecution({ id: executionId, status: "failed", error })
          return c.json({ executionId, ok: false, error })
        }

        stepResults[step.id] = result.data.result
        continue
      }

      const runtimeConfig = agent.runtimeConfig as { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }
      const tool = runtimeConfig?.tools?.find((t) => t.name === step.toolName)
      if (!tool) {
        const error = `Step "${step.id}" (${step.toolName}): Tool not found`
        await updateRecipeExecution({ id: executionId, status: "failed", error })
        return c.json({ executionId, ok: false, error })
      }

      const timeout =
        typeof tool.timeoutMs === "number" && tool.timeoutMs >= 100 && tool.timeoutMs <= 60000 ? tool.timeoutMs : 30000

      const result = await executor.execute(organizationId, {
        code: tool.code,
        params,
        context: { resources: resources.map((r) => ({ name: r.slug, resourceId: r.id, type: r.type })) },
        environmentId: execution.environmentId,
        timeout,
      })

      if (!result.ok || !result.data.success) {
        const baseError = !result.ok ? toErrorMessage(result.error) : (result.data.error ?? "Code execution failed")
        const error = `Step "${step.id}" (${step.toolName}): ${baseError}`
        await updateRecipeExecution({ id: executionId, status: "failed", error })
        return c.json({ executionId, ok: false, error })
      }

      stepResults[step.id] = result.data.result
    }

    await updateRecipeExecution({
      id: executionId,
      status: "completed",
      outputItemIds,
      results: stepResults,
      resolvedParams,
    })

    return c.json({ executionId, ok: true, outputItemIds, stepResults })
  },
)
