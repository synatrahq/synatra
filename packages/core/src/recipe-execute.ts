import type { RecipeStep, ParamBinding, PendingInputConfig } from "./types"
import { isOutputTool, isHumanTool, isComputeTool } from "./system-tools"

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

  for (const part of parts) {
    if (current === null || current === undefined) return undefined

    if (part === "*") {
      if (!Array.isArray(current)) return undefined
      const remaining = parts.slice(parts.indexOf(part) + 1).join(".")
      if (remaining) {
        return current.map((item) => getValueByPath(item, remaining))
      }
      return current
    }

    if (typeof current === "object" && current !== null) {
      const index = parseInt(part, 10)
      if (!isNaN(index) && Array.isArray(current)) {
        current = current[index]
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

    case "step": {
      const stepResult = context.results[binding.stepId]
      return getValueByPath(stepResult, binding.path)
    }

    case "template": {
      let result = binding.template
      for (const [varName, varBinding] of Object.entries(binding.variables)) {
        const value = resolveBinding(varBinding, context)
        result = result.replace(new RegExp(`\\{\\{${varName}\\}\\}`, "g"), String(value ?? ""))
      }
      return result
    }

    case "object": {
      const obj: Record<string, unknown> = {}
      for (const [key, entryBinding] of Object.entries(binding.entries)) {
        obj[key] = resolveBinding(entryBinding, context)
      }
      return obj
    }

    default:
      return undefined
  }
}

export function resolveStepParams(step: RecipeStep, context: RecipeExecutionContext): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [paramName, binding] of Object.entries(step.params)) {
    resolved[paramName] = resolveBinding(binding, context)
  }
  return resolved
}

export function getStepExecutionOrder(steps: RecipeStep[]): RecipeStep[] {
  const stepMap = new Map(steps.map((s) => [s.id, s]))
  const visited = new Set<string>()
  const order: RecipeStep[] = []

  function visit(stepId: string) {
    if (visited.has(stepId)) return
    visited.add(stepId)

    const step = stepMap.get(stepId)
    if (!step) return

    for (const depId of step.dependsOn) {
      visit(depId)
    }
    order.push(step)
  }

  for (const step of steps) {
    visit(step.id)
  }

  return order
}

export function isHumanInputStep(step: RecipeStep): boolean {
  if (step.toolName !== "human_request") return false

  const fieldsBinding = step.params.fields
  if (!fieldsBinding || fieldsBinding.type !== "static") return false

  const fields = fieldsBinding.value as Array<{ kind: string }>
  if (!Array.isArray(fields)) return false

  return fields.some((f) => f.kind === "form" || f.kind === "question" || f.kind === "select_rows")
}

export function buildPendingInputConfig(step: RecipeStep, params: Record<string, unknown>): PendingInputConfig {
  return {
    stepId: step.id,
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
  step: RecipeStep
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

  if (isHumanTool(step.toolName)) {
    if (isHumanInputStep(step)) {
      const config = buildPendingInputConfig(step, params)
      return { type: "waiting_input", config }
    }
    return { type: "success", result: { skipped: true, reason: "approval_not_supported" } }
  }

  if (isOutputTool(step.toolName)) {
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

  if (isComputeTool(step.toolName)) {
    return { type: "error", error: `Unknown compute tool: ${step.toolName}` }
  }

  const result = await executeFunction(step.toolName, params)

  if (!result.ok) {
    return { type: "error", error: result.error ?? "Function execution failed" }
  }

  return { type: "success", result: result.result }
}

export interface RecipeRunner {
  steps: RecipeStep[]
  context: RecipeExecutionContext
  currentStepIndex: number
  status: "pending" | "running" | "waiting_input" | "completed" | "failed"
  error?: string
  outputItemIds: string[]
}

export function createRecipeRunner(steps: RecipeStep[], inputs: Record<string, unknown>): RecipeRunner {
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

export function getNextStep(runner: RecipeRunner): RecipeStep | null {
  if (runner.currentStepIndex >= runner.steps.length) {
    return null
  }
  return runner.steps[runner.currentStepIndex]
}

export function advanceRunner(runner: RecipeRunner, stepId: string, result: unknown): RecipeRunner {
  return {
    ...runner,
    context: {
      ...runner.context,
      results: {
        ...runner.context.results,
        [stepId]: result,
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

export function resumeRunnerWithInput(runner: RecipeRunner, stepId: string, response: unknown): RecipeRunner {
  return {
    ...runner,
    context: {
      ...runner.context,
      results: {
        ...runner.context.results,
        [stepId]: response,
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
