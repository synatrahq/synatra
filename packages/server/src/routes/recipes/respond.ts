import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  getRecipeById,
  getAgentById,
  listResources,
  respondToRecipeExecution,
  updateRecipeExecution,
  withDb,
  OutputItemTable,
  resolveStepParams,
  getStepExecutionOrder,
  isHumanInputStep,
  buildPendingInputConfig,
} from "@synatra/core"
import { isManagedResourceType } from "@synatra/core/types"
import { isOutputTool, isComputeTool } from "@synatra/core/system-tools"
import { loadConfig, createCodeExecutor } from "@synatra/service-call"
import { principal } from "@synatra/core"
import { toErrorMessage } from "@synatra/util/error"

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

    const currentStepIndex = sortedSteps.findIndex((s) => s.id === execution.currentStepId)
    if (currentStepIndex === -1) {
      return c.json({ error: "Current step not found" }, 400)
    }

    stepResults[execution.currentStepId!] = response
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
            const [item] = await withDb((db) =>
              db
                .insert(OutputItemTable)
                .values({
                  threadId: body.threadId!,
                  kind: output.kind,
                  name: output.name ?? null,
                  payload: params,
                })
                .returning(),
            )
            outputItemIds.push(item.id)
          }
        }
        continue
      }

      if (isComputeTool(step.toolName)) {
        const code = params.code as string
        const input = params.input as Record<string, unknown> | undefined

        const result = await executor.execute(organizationId, {
          code,
          params: input ?? {},
          paramAlias: input !== undefined ? "input" : undefined,
          context: { resources: [] },
          environmentId: execution.environmentId,
          timeout: 30000,
        })

        if (!result.ok || !result.data.success) {
          const error = !result.ok ? toErrorMessage(result.error) : (result.data.error ?? "Compute execution failed")
          await updateRecipeExecution({ id: executionId, status: "failed", error })
          return c.json({ executionId, ok: false, error })
        }

        stepResults[step.id] = result.data.result
        continue
      }

      const runtimeConfig = agent.runtimeConfig as { tools?: Array<{ name: string; code: string; timeoutMs?: number }> }
      const tool = runtimeConfig?.tools?.find((t) => t.name === step.toolName)
      if (!tool) {
        const error = `Tool not found: ${step.toolName}`
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
        const error = !result.ok ? toErrorMessage(result.error) : (result.data.error ?? "Code execution failed")
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
