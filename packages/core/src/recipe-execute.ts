import type { ParamBinding, PendingInputConfig, RecipeOutput } from "./types"
import type { RecipeStep as RecipeStepDb, RecipeEdge } from "./schema/recipe.sql"
import { isOutputTool, isHumanTool, isComputeTool } from "./system-tools"
import type { ProblemDetails } from "@synatra/util/error"

export interface NormalizedStep {
  stepKey: string
  label: string
  stepType: "action" | "branch" | "loop"
  toolName: string | null
  params: Record<string, ParamBinding>
  position: number
  dependsOn: string[]
}

export interface RecipeExecutionContext {
  inputs: Record<string, unknown>
  results: Record<string, unknown>
  resolvedParams: Record<string, Record<string, unknown>>
}

export function getValueByPath(obj: unknown, path?: string): unknown {
  if (!path || path === "$") return obj

  const normalizedPath = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path

  if (!normalizedPath) return obj

  const parts = normalizedPath.split(/\.|\[|\]/).filter(Boolean)
  let current: unknown = obj

  for (const [i, part] of parts.entries()) {
    if (current === null || current === undefined) return undefined

    if (part === "*") {
      if (!Array.isArray(current)) return undefined
      const remaining = parts.slice(i + 1).join(".")
      if (remaining) {
        return current.map((item) => getValueByPath(item, remaining))
      }
      return current
    }

    if (typeof current === "object" && current !== null) {
      const idx = parseInt(part, 10)
      if (!isNaN(idx) && Array.isArray(current)) {
        current = current[idx]
      } else {
        current = (current as Record<string, unknown>)[part]
      }
    } else {
      return undefined
    }
  }

  return current
}

export function resolveBinding(binding: ParamBinding, context: RecipeExecutionContext): unknown {
  switch (binding.type) {
    case "static":
      return binding.value
    case "input":
      return context.inputs[binding.inputKey]
    case "step":
      return getValueByPath(context.results[binding.stepId], binding.path)
    case "template": {
      let result = binding.template
      for (const [varName, varBinding] of Object.entries(binding.variables)) {
        const value = resolveBinding(varBinding, context)
        const strValue = value === null || value === undefined ? "" : String(value)
        result = result.replaceAll(`{{${varName}}}`, strValue)
      }
      return result
    }
    case "object":
      return Object.fromEntries(Object.entries(binding.entries).map(([key, b]) => [key, resolveBinding(b, context)]))
    case "array":
      return binding.items.map((item) => resolveBinding(item, context))
    default:
      return undefined
  }
}

export function resolveStepParams(step: NormalizedStep, context: RecipeExecutionContext): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(step.params).map(([name, binding]) => [name, resolveBinding(binding, context)]),
  )
}

export function buildNormalizedSteps(steps: RecipeStepDb[], edges: RecipeEdge[]): NormalizedStep[] {
  const edgeMap = new Map<string, string[]>()
  for (const edge of edges) {
    const deps = edgeMap.get(edge.toStepKey) ?? []
    deps.push(edge.fromStepKey)
    edgeMap.set(edge.toStepKey, deps)
  }

  return steps.map((step) => ({
    stepKey: step.stepKey,
    label: step.label,
    stepType: step.stepType,
    toolName: step.toolName,
    params: step.params,
    position: step.position,
    dependsOn: edgeMap.get(step.stepKey) ?? [],
  }))
}

export function getStepExecutionOrder(steps: NormalizedStep[]): NormalizedStep[] {
  const stepMap = new Map(steps.map((s) => [s.stepKey, s]))
  const visited = new Set<string>()
  const order: NormalizedStep[] = []

  function visit(stepKey: string) {
    if (visited.has(stepKey)) return
    visited.add(stepKey)

    const step = stepMap.get(stepKey)
    if (!step) return

    for (const depKey of step.dependsOn) {
      visit(depKey)
    }
    order.push(step)
  }

  for (const step of steps) {
    visit(step.stepKey)
  }

  return order
}

export function isHumanInputStep(step: NormalizedStep): boolean {
  if (step.toolName !== "human_request") return false

  const fieldsBinding = step.params.fields
  if (!fieldsBinding || fieldsBinding.type !== "static") return false

  const fields = fieldsBinding.value as Array<{ kind: string }>
  if (!Array.isArray(fields)) return false

  return fields.some((f) => f.kind === "form" || f.kind === "question" || f.kind === "select_rows")
}

export function buildPendingInputConfig(step: NormalizedStep, params: Record<string, unknown>): PendingInputConfig {
  return {
    stepKey: step.stepKey,
    title: (params.title as string) ?? "Input Required",
    description: params.description as string | undefined,
    fields: (params.fields as Array<Record<string, unknown>>) ?? [],
  }
}

export type StepExecutionResult =
  | { type: "success"; result: unknown }
  | { type: "waiting_input"; config: PendingInputConfig }
  | { type: "output"; outputItemId: string }
  | { type: "error"; error: string }

export interface ExecuteStepOptions {
  step: NormalizedStep
  params: Record<string, unknown>
  executeFunction: (
    toolName: string,
    params: Record<string, unknown>,
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }>
  executeCodePure: (code: string, input?: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>
  createOutputItem: (kind: string, name: string | undefined, payload: Record<string, unknown>) => Promise<string>
}

export async function executeRecipeStep(options: ExecuteStepOptions): Promise<StepExecutionResult> {
  const { step, params, executeFunction, executeCodePure, createOutputItem } = options

  if (step.toolName === "code_execute") {
    const code = params.code as string
    const input = params.input
    const result = await executeCodePure(code, input)

    if (!result.success) {
      return { type: "error", error: result.error ?? "Code execution failed" }
    }
    return { type: "success", result: result.result }
  }

  if (step.toolName && isHumanTool(step.toolName)) {
    if (isHumanInputStep(step)) {
      const config = buildPendingInputConfig(step, params)
      return { type: "waiting_input", config }
    }
    return { type: "success", result: { skipped: true, reason: "approval_not_supported" } }
  }

  if (step.toolName && isOutputTool(step.toolName)) {
    const kindMap: Record<string, string> = {
      output_table: "table",
      output_chart: "chart",
      output_markdown: "markdown",
      output_key_value: "key_value",
    }
    const kind = kindMap[step.toolName] ?? "markdown"
    const name = params.name as string | undefined
    const { name: _, ...payload } = params

    const outputItemId = await createOutputItem(kind, name, payload as Record<string, unknown>)
    return { type: "output", outputItemId }
  }

  if (step.toolName && isComputeTool(step.toolName)) {
    return { type: "error", error: `Unknown compute tool: ${step.toolName}` }
  }

  if (!step.toolName) {
    return { type: "error", error: "Step has no tool name" }
  }

  const result = await executeFunction(step.toolName, params)

  if (!result.ok) {
    return { type: "error", error: result.error ?? "Function execution failed" }
  }

  return { type: "success", result: result.result }
}

export interface RecipeRunner {
  steps: NormalizedStep[]
  context: RecipeExecutionContext
  currentStepIndex: number
  status: "pending" | "running" | "waiting_input" | "completed" | "failed"
  error?: string
  outputItemIds: string[]
}

export function createRecipeRunner(steps: NormalizedStep[], inputs: Record<string, unknown>): RecipeRunner {
  const orderedSteps = getStepExecutionOrder(steps)

  return {
    steps: orderedSteps,
    context: {
      inputs,
      results: {},
      resolvedParams: {},
    },
    currentStepIndex: 0,
    status: "pending",
    error: undefined,
    outputItemIds: [],
  }
}

export function getNextStep(runner: RecipeRunner): NormalizedStep | null {
  if (runner.currentStepIndex >= runner.steps.length) {
    return null
  }
  return runner.steps[runner.currentStepIndex]
}

export function advanceRunner(runner: RecipeRunner, stepKey: string, result: unknown): RecipeRunner {
  return {
    ...runner,
    context: {
      ...runner.context,
      results: {
        ...runner.context.results,
        [stepKey]: result,
      },
    },
    currentStepIndex: runner.currentStepIndex + 1,
    status: runner.currentStepIndex + 1 >= runner.steps.length ? "completed" : "running",
  }
}

export function failRunner(runner: RecipeRunner, error: string): RecipeRunner {
  return {
    ...runner,
    status: "failed",
    error,
  }
}

export function pauseRunnerForInput(runner: RecipeRunner): RecipeRunner {
  return {
    ...runner,
    status: "waiting_input",
  }
}

export function resumeRunnerWithInput(runner: RecipeRunner, stepKey: string, response: unknown): RecipeRunner {
  return {
    ...runner,
    context: {
      ...runner.context,
      results: {
        ...runner.context.results,
        [stepKey]: response,
      },
    },
    currentStepIndex: runner.currentStepIndex + 1,
    status: "running",
  }
}

export function addOutputItemId(runner: RecipeRunner, outputItemId: string): RecipeRunner {
  return {
    ...runner,
    outputItemIds: [...runner.outputItemIds, outputItemId],
  }
}

export type ExecuteCodeResult =
  | { ok: true; data: { success: boolean; result?: unknown; error?: string } }
  | { ok: false; error: ProblemDetails }

export interface StepExecutorDependencies {
  organizationId: string
  environmentId: string
  agentTools: Array<{ name: string; code: string; timeoutMs?: number }>
  resources: Array<{ slug: string; id: string; type: string }>
  recipeOutputs: RecipeOutput[]
  threadId?: string
  executeCode: (
    organizationId: string,
    input: {
      code: string
      params: Record<string, unknown>
      paramAlias?: "payload" | "input"
      context: { resources: Array<{ name: string; resourceId: string; type: string }> }
      environmentId: string
      timeout: number
    },
  ) => Promise<ExecuteCodeResult>
  createOutputItem?: (params: {
    threadId: string
    kind: "table" | "chart" | "markdown" | "key_value"
    name?: string
    payload: Record<string, unknown>
  }) => Promise<{ item: { id: string } }>
}

export type StepLoopResult =
  | {
      status: "completed"
      stepResults: Record<string, unknown>
      resolvedParams: Record<string, Record<string, unknown>>
      outputItemIds: string[]
    }
  | {
      status: "waiting_input"
      currentStepKey: string
      pendingInputConfig: PendingInputConfig
      stepResults: Record<string, unknown>
      resolvedParams: Record<string, Record<string, unknown>>
      outputItemIds: string[]
    }
  | {
      status: "failed"
      error: { stepKey: string; toolName: string; message: string }
      currentStepKey: string
      stepResults: Record<string, unknown>
      resolvedParams: Record<string, Record<string, unknown>>
    }

function toErrorMessage(error: ProblemDetails): string {
  return error.detail ?? error.title ?? "Unknown error"
}

export async function executeStepLoop(
  steps: NormalizedStep[],
  startIndex: number,
  initialContext: RecipeExecutionContext,
  initialOutputItemIds: string[],
  deps: StepExecutorDependencies,
): Promise<StepLoopResult> {
  const stepResults = { ...initialContext.results }
  const resolvedParams = { ...initialContext.resolvedParams }
  const outputItemIds = [...initialOutputItemIds]
  const context = { inputs: initialContext.inputs, results: stepResults, resolvedParams }

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i]
    const params = resolveStepParams(step, context)
    resolvedParams[step.stepKey] = params

    if (isHumanInputStep(step)) {
      const pendingInputConfig = buildPendingInputConfig(step, params)
      return {
        status: "waiting_input",
        currentStepKey: step.stepKey,
        pendingInputConfig,
        stepResults,
        resolvedParams,
        outputItemIds,
      }
    }

    if (step.toolName && isOutputTool(step.toolName)) {
      stepResults[step.stepKey] = params
      if (deps.threadId && deps.createOutputItem) {
        const output = deps.recipeOutputs.find((o) => o.stepId === step.stepKey)
        if (output) {
          const { item } = await deps.createOutputItem({
            threadId: deps.threadId,
            kind: output.kind,
            name: output.name,
            payload: params as Record<string, unknown>,
          })
          outputItemIds.push(item.id)
        }
      }
      continue
    }

    if (step.toolName && isComputeTool(step.toolName)) {
      const code = params.code as string
      const input = params.input as Record<string, unknown> | undefined
      const timeout =
        typeof params.timeout === "number" && params.timeout >= 100 && params.timeout <= 30000 ? params.timeout : 10000

      const result = await deps.executeCode(deps.organizationId, {
        code,
        params: input ?? {},
        paramAlias: input !== undefined ? "input" : undefined,
        context: { resources: deps.resources.map((r) => ({ name: r.slug, resourceId: r.id, type: r.type })) },
        environmentId: deps.environmentId,
        timeout,
      })

      if (!result.ok || !result.data.success) {
        const message = !result.ok ? toErrorMessage(result.error) : (result.data.error ?? "Compute execution failed")
        return {
          status: "failed",
          error: { stepKey: step.stepKey, toolName: step.toolName, message },
          currentStepKey: step.stepKey,
          stepResults,
          resolvedParams,
        }
      }

      stepResults[step.stepKey] = result.data.result
      continue
    }

    if (!step.toolName) {
      return {
        status: "failed",
        error: { stepKey: step.stepKey, toolName: "", message: "Step has no tool name" },
        currentStepKey: step.stepKey,
        stepResults,
        resolvedParams,
      }
    }

    const tool = deps.agentTools.find((t) => t.name === step.toolName)
    if (!tool) {
      return {
        status: "failed",
        error: { stepKey: step.stepKey, toolName: step.toolName, message: "Tool not found" },
        currentStepKey: step.stepKey,
        stepResults,
        resolvedParams,
      }
    }

    const timeout =
      typeof tool.timeoutMs === "number" && tool.timeoutMs >= 100 && tool.timeoutMs <= 60000 ? tool.timeoutMs : 30000

    const result = await deps.executeCode(deps.organizationId, {
      code: tool.code,
      params,
      context: { resources: deps.resources.map((r) => ({ name: r.slug, resourceId: r.id, type: r.type })) },
      environmentId: deps.environmentId,
      timeout,
    })

    if (!result.ok || !result.data.success) {
      const message = !result.ok ? toErrorMessage(result.error) : (result.data.error ?? "Code execution failed")
      return {
        status: "failed",
        error: { stepKey: step.stepKey, toolName: step.toolName, message },
        currentStepKey: step.stepKey,
        stepResults,
        resolvedParams,
      }
    }

    stepResults[step.stepKey] = result.data.result
  }

  return {
    status: "completed",
    stepResults,
    resolvedParams,
    outputItemIds,
  }
}
