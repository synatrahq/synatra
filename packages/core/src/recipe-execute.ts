import type {
  Value,
  PendingInputConfig,
  QueryStepConfig,
  CodeStepConfig,
  OutputStepConfig,
  InputStepConfig,
  RecipeStepType,
} from "./types"
import type { RecipeStep } from "./schema/recipe.sql"
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

export function getValueByPath(obj: unknown, path?: Array<string | number>): unknown {
  if (!path || path.length === 0) return obj

  let current: unknown = obj

  for (const [i, part] of path.entries()) {
    if (current === null || current === undefined) return undefined

    if (part === "*") {
      if (!Array.isArray(current)) return undefined
      const remaining = path.slice(i + 1)
      if (remaining.length > 0) {
        return current.map((item) => getValueByPath(item, remaining))
      }
      return current
    }

    if (typeof part === "number") {
      if (!Array.isArray(current)) return undefined
      current = current[part]
      continue
    }

    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part]
      continue
    }

    return undefined
  }

  return current
}

type BindingCast = "string" | "number" | "boolean" | "object" | "array"

function castBindingValue(value: unknown, target: BindingCast): unknown {
  switch (target) {
    case "string":
      return value === null || value === undefined ? "" : String(value)
    case "number": {
      if (typeof value === "number") return value
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value)
        return Number.isNaN(parsed) ? undefined : parsed
      }
      return undefined
    }
    case "boolean": {
      if (typeof value === "boolean") return value
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (normalized === "true") return true
        if (normalized === "false") return false
        return undefined
      }
      if (typeof value === "number") return value !== 0
      return undefined
    }
    case "object":
      return value && typeof value === "object" && !Array.isArray(value) ? value : undefined
    case "array":
      return Array.isArray(value) ? value : undefined
    default:
      return value
  }
}

export function resolveBinding(binding: Value, context: RecipeExecutionContext): unknown {
  switch (binding.type) {
    case "literal":
      return binding.value
    case "ref": {
      const source = binding.scope === "input" ? context.inputs : context.results
      const base = source[binding.key]
      const resolved = binding.path ? getValueByPath(base, binding.path) : base
      return binding.as ? castBindingValue(resolved, binding.as) : resolved
    }
    case "template": {
      return binding.parts
        .map((part) => {
          if (part.type === "text") return part.value
          const value = resolveBinding(part.value, context)
          return value === null || value === undefined ? "" : String(value)
        })
        .join("")
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
  if (step.type === "query" || step.type === "code" || step.type === "output") {
    return resolveBinding(step.config.params, context)
  }
  return {}
}

export function buildNormalizedSteps(steps: RecipeStep[]): NormalizedStep[] {
  if (steps.length === 0) return []

  return steps.map((step) => ({
    stepKey: step.stepKey,
    label: step.label,
    type: step.type,
    config: step.config,
  })) as NormalizedStep[]
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
  const resolvedFields = step.config.params.fields.map((field) => {
    const resolved = Object.fromEntries(
      Object.entries(field)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, resolveBinding(value as Value, context)]),
    )
    const kind = resolved.kind
    if (kind !== "select_rows" && kind !== "form" && kind !== "question") {
      throw new Error(`Invalid input field kind: ${String(kind)}`)
    }
    return resolved
  })

  const title = resolveBinding(step.config.params.title, context)
  const description = step.config.params.description
    ? resolveBinding(step.config.params.description, context)
    : undefined

  return {
    stepKey: step.stepKey,
    title: typeof title === "string" ? title : String(title ?? ""),
    description: typeof description === "string" ? description : description ? String(description) : undefined,
    fields: resolvedFields as Array<Record<string, unknown>>,
  }
}

export type StepExecutionResult =
  | { type: "success"; result: unknown }
  | { type: "waiting_input"; config: PendingInputConfig }
  | { type: "error"; error: string }

export interface RecipeRunner {
  steps: NormalizedStep[]
  context: RecipeExecutionContext
  currentStepIndex: number
  status: "pending" | "running" | "waiting_input" | "completed" | "failed"
  error?: string
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

export type ExecuteCodeResult =
  | { ok: true; data: { success: boolean; result?: unknown; error?: string } }
  | { ok: false; error: ProblemDetails }

export interface StepExecutorDependencies {
  organizationId: string
  environmentId: string
  resources: Array<{ slug: string; id: string; type: string }>
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
}

export type StepLoopResult =
  | {
      status: "completed"
      stepResults: Record<string, unknown>
      resolvedParams: Record<string, unknown>
    }
  | {
      status: "waiting_input"
      currentStepKey: string
      pendingInputConfig: PendingInputConfig
      stepResults: Record<string, unknown>
      resolvedParams: Record<string, unknown>
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

function toTimeout(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === "number" && value >= min && value <= max) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) return parsed
  }
  return fallback
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function executeStepLoop(
  steps: NormalizedStep[],
  startIndex: number,
  initialContext: RecipeExecutionContext,
  deps: StepExecutorDependencies,
): Promise<StepLoopResult> {
  const stepResults = { ...initialContext.results }
  const resolvedParams: Record<string, unknown> = { ...initialContext.resolvedParams }
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
      }
    }

    if (step.type === "output") {
      if (!isPlainObject(params)) {
        return {
          status: "failed",
          error: { stepKey: step.stepKey, stepType: step.type, message: "Output params must be an object" },
          currentStepKey: step.stepKey,
          stepResults,
          resolvedParams,
        }
      }
      stepResults[step.stepKey] = params
      continue
    }

    if (step.type === "query") {
      const codeValue = resolveBinding(step.config.code, context)
      const code = typeof codeValue === "string" ? codeValue : String(codeValue ?? "")
      const timeoutValue = step.config.timeoutMs ? resolveBinding(step.config.timeoutMs, context) : undefined
      const timeout = toTimeout(timeoutValue, 100, 60000, 30000)

      if (!isPlainObject(params)) {
        return {
          status: "failed",
          error: { stepKey: step.stepKey, stepType: step.type, message: "Query params must be an object" },
          currentStepKey: step.stepKey,
          stepResults,
          resolvedParams,
        }
      }

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
      const codeValue = resolveBinding(step.config.code, context)
      const code = typeof codeValue === "string" ? codeValue : String(codeValue ?? "")
      const timeoutValue = step.config.timeoutMs ? resolveBinding(step.config.timeoutMs, context) : undefined
      const timeout = toTimeout(timeoutValue, 100, 30000, 10000)

      if (!isPlainObject(params)) {
        return {
          status: "failed",
          error: { stepKey: step.stepKey, stepType: step.type, message: "Code params must be an object" },
          currentStepKey: step.stepKey,
          stepResults,
          resolvedParams,
        }
      }

      const result = await deps.executeCode(deps.organizationId, {
        code,
        params,
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
  }
}
