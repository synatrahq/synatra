import type {
  ParamBinding,
  PendingInputConfig,
  RecipeOutput,
  RecipeStepConfig,
  QueryStepConfig,
  CodeStepConfig,
  OutputStepConfig,
  InputStepConfig,
  RecipeStepType,
} from "./types"
import type { RecipeStepDb, RecipeEdge } from "./schema/recipe.sql"
import type { ProblemDetails } from "@synatra/util/error"

export type NormalizedStep = {
  stepKey: string
  label: string
} & (
  | { type: "query"; config: QueryStepConfig }
  | { type: "code"; config: CodeStepConfig }
  | { type: "output"; config: OutputStepConfig }
  | { type: "input"; config: InputStepConfig }
)

export interface RecipeExecutionContext {
  inputs: Record<string, unknown>
  results: Record<string, unknown>
  resolvedParams: Record<string, unknown>
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
      return getValueByPath(context.results[binding.stepKey], binding.path)
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

export function resolveStepParams(step: NormalizedStep, context: RecipeExecutionContext): unknown {
  if (step.type === "query" || step.type === "code") {
    return resolveBinding(step.config.binding, context)
  }
  if (step.type === "output") {
    return resolveBinding(step.config.binding, context)
  }
  return {}
}

export function buildNormalizedSteps(steps: RecipeStepDb[], _edges: RecipeEdge[]): NormalizedStep[] {
  if (steps.length === 0) return []

  return steps.map((step) => ({
    stepKey: step.stepKey,
    label: step.label,
    type: step.type,
    config: step.config,
  })) as NormalizedStep[]
}

export function getStepType(step: NormalizedStep): RecipeStepType {
  return step.type
}

export function getStepExecutionOrder(steps: NormalizedStep[]): NormalizedStep[] {
  return steps
}

export function isInputStep(step: NormalizedStep): step is NormalizedStep & { type: "input"; config: InputStepConfig } {
  return step.type === "input"
}

export function buildPendingInputConfig(
  step: NormalizedStep & { type: "input"; config: InputStepConfig },
  context: RecipeExecutionContext,
): PendingInputConfig {
  const resolvedFields = step.config.fields.map((field) => {
    if (field.kind === "select_rows") {
      return {
        ...field,
        data: resolveBinding(field.data, context) as Array<Record<string, unknown>>,
      }
    }
    if (field.kind === "form" && field.defaults) {
      const resolvedDefaults = resolveBinding(field.defaults, context) as Record<string, unknown>
      return {
        ...field,
        defaults: resolvedDefaults,
      }
    }
    return field
  })

  return {
    stepKey: step.stepKey,
    title: step.config.title,
    description: step.config.description,
    fields: resolvedFields as Array<Record<string, unknown>>,
  }
}

export type StepExecutionResult =
  | { type: "success"; result: unknown }
  | { type: "waiting_input"; config: PendingInputConfig }
  | { type: "output"; outputItemId: string }
  | { type: "error"; error: string }

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
  resources: Array<{ slug: string; id: string; type: string }>
  recipeOutputs: RecipeOutput[]
  threadId?: string
  executeCode: (
    organizationId: string,
    input: {
      code: string
      params: unknown
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
      resolvedParams: Record<string, unknown>
      outputItemIds: string[]
    }
  | {
      status: "waiting_input"
      currentStepKey: string
      pendingInputConfig: PendingInputConfig
      stepResults: Record<string, unknown>
      resolvedParams: Record<string, unknown>
      outputItemIds: string[]
    }
  | {
      status: "failed"
      error: { stepKey: string; stepType: RecipeStepType; message: string }
      currentStepKey: string
      stepResults: Record<string, unknown>
      resolvedParams: Record<string, unknown>
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
  const resolvedParams: Record<string, unknown> = { ...initialContext.resolvedParams }
  const outputItemIds = [...initialOutputItemIds]
  const context = { inputs: initialContext.inputs, results: stepResults, resolvedParams }

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i]
    const params = resolveStepParams(step, context)
    resolvedParams[step.stepKey] = params

    if (step.type === "input") {
      const pendingInputConfig = buildPendingInputConfig(step, context)
      return {
        status: "waiting_input",
        currentStepKey: step.stepKey,
        pendingInputConfig,
        stepResults,
        resolvedParams,
        outputItemIds,
      }
    }

    if (step.type === "output") {
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

    if (step.type === "query") {
      const { code, timeoutMs } = step.config
      const timeout = typeof timeoutMs === "number" && timeoutMs >= 100 && timeoutMs <= 60000 ? timeoutMs : 30000

      const result = await deps.executeCode(deps.organizationId, {
        code,
        params,
        context: { resources: deps.resources.map((r) => ({ name: r.slug, resourceId: r.id, type: r.type })) },
        environmentId: deps.environmentId,
        timeout,
      })

      if (!result.ok || !result.data.success) {
        const message = !result.ok ? toErrorMessage(result.error) : (result.data.error ?? "Query execution failed")
        return {
          status: "failed",
          error: { stepKey: step.stepKey, stepType: step.type, message },
          currentStepKey: step.stepKey,
          stepResults,
          resolvedParams,
        }
      }

      stepResults[step.stepKey] = result.data.result
    }

    if (step.type === "code") {
      const { code, timeoutMs } = step.config
      const timeout = typeof timeoutMs === "number" && timeoutMs >= 100 && timeoutMs <= 30000 ? timeoutMs : 10000

      const result = await deps.executeCode(deps.organizationId, {
        code,
        params,
        paramAlias: "input",
        context: { resources: [] },
        environmentId: deps.environmentId,
        timeout,
      })

      if (!result.ok || !result.data.success) {
        const message = !result.ok ? toErrorMessage(result.error) : (result.data.error ?? "Code execution failed")
        return {
          status: "failed",
          error: { stepKey: step.stepKey, stepType: step.type, message },
          currentStepKey: step.stepKey,
          stepResults,
          resolvedParams,
        }
      }

      stepResults[step.stepKey] = result.data.result
    }
  }

  return {
    status: "completed",
    stepResults,
    resolvedParams,
    outputItemIds,
  }
}
