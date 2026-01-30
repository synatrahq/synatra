import { Show, For, createSignal, createMemo, createEffect, on, Switch, Match } from "solid-js"
import {
  Play,
  Clock,
  CheckCircle,
  XCircle,
  CaretRight,
  PencilSimple,
  ListChecks,
  HourglassHigh,
  Function,
  Code,
  TextT,
  Hash,
  BracketsCurly,
  Table,
  ChartLine,
  TextAa,
  ListDashes,
  LineSegments,
  PlugsConnected,
  Export,
  SignIn,
} from "phosphor-solid-js"
import {
  Button,
  Input,
  Textarea,
  Badge,
  Spinner,
  Select,
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  CodeEditor,
  type SelectOption,
  type JSONSchema,
} from "../../ui"
import { EntityIcon, OutputItemRenderer } from "../../components"
import { FormField, extractDefaults, validateFieldValue } from "../../components/human-request/form-field"
import { QuestionField } from "../../components/human-request/question-field"
import { SelectRowsField } from "../../components/human-request/select-rows-field"
import type { Recipe, RecipeExecution, Agents, Environments, OutputItem } from "../../app/api"
import type {
  HumanRequestFieldConfig,
  HumanRequestFormConfig,
  HumanRequestQuestionConfig,
  HumanRequestSelectRowsConfig,
  ParamBinding,
  RecipeStep,
} from "@synatra/core/types"

function getToolName(step: RecipeStep): string {
  return step.config.toolName
}

function getParams(step: RecipeStep): Record<string, ParamBinding> {
  return step.config.params
}

type Tab = "configuration" | "result"

type RecipeExecutionError = {
  stepKey: string
  toolName: string
  message: string
}

type LastResult = {
  status: "completed" | "failed" | "waiting_input"
  stepResults?: Record<string, unknown>
  resolvedParams?: Record<string, Record<string, unknown>>
  outputItemIds?: string[]
  error?: RecipeExecutionError
  executionId?: string
  pendingInputConfig?: unknown
  durationMs?: number
}

type PendingInputConfig = {
  fields: HumanRequestFieldConfig[]
}

function formatBindingRef(binding: ParamBinding): string {
  switch (binding.type) {
    case "static":
      return JSON.stringify(binding.value)
    case "input":
      return `input.${binding.inputKey}`
    case "step": {
      const path = binding.path?.replace(/^\$\.?/, "") ?? ""
      return path ? `${binding.stepId}.${path}` : binding.stepId
    }
    default:
      return "[complex]"
  }
}

function resolveBinding(binding: ParamBinding): unknown {
  switch (binding.type) {
    case "static":
      return binding.value
    case "input":
      return `$input.${binding.inputKey}`
    case "step": {
      const path = binding.path?.replace(/^\$\.?/, "") ?? ""
      return path ? `$step.${binding.stepId}.${path}` : `$step.${binding.stepId}`
    }
    case "template": {
      let result = binding.template
      for (const [k, v] of Object.entries(binding.variables)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), `{{ ${formatBindingRef(v)} }}`)
      }
      return result
    }
    case "object":
      return Object.fromEntries(Object.entries(binding.entries).map(([k, v]) => [k, resolveBinding(v)]))
    case "array":
      return binding.items.map((item) => resolveBinding(item))
  }
}

function resolveParams(params: Record<string, ParamBinding>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).map(([key, binding]) => [key, resolveBinding(binding)]))
}

type ToolDef = { name: string; description?: string; code: string }

function StepToolIcon(props: { toolName: string; isCustomTool: boolean; class?: string }) {
  const iconClass = () => props.class ?? "h-4 w-4"

  if (props.isCustomTool) {
    return <Code class={iconClass()} />
  }

  switch (props.toolName) {
    case "output_table":
      return <Table class={iconClass()} />
    case "output_chart":
      return <ChartLine class={iconClass()} />
    case "output_markdown":
      return <TextAa class={iconClass()} />
    case "output_key_value":
      return <ListDashes class={iconClass()} />
    case "compute":
      return <Function class={iconClass()} />
    case "human_request":
      return <SignIn class={iconClass()} />
    case "task_complete":
      return <CheckCircle class={iconClass()} />
    default:
      return <Function class={iconClass()} />
  }
}

function StepItem(props: { step: RecipeStep; index: number; tools?: ToolDef[]; isLast?: boolean; totalSteps: number }) {
  const [expanded, setExpanded] = createSignal(false)
  const toolName = () => getToolName(props.step)
  const params = () => getParams(props.step)
  const hasParams = () => Object.keys(params()).length > 0
  const toolDef = () => props.tools?.find((t) => t.name === toolName())
  const isCustomTool = () => !!toolDef()

  return (
    <div class="relative">
      <Show when={!props.isLast}>
        <div class="absolute left-[15px] top-[32px] bottom-[-8px] w-px bg-border" />
      </Show>

      <button
        type="button"
        class="flex items-center gap-3 w-full text-left group"
        onClick={() => setExpanded(!expanded())}
      >
        <div
          class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors"
          classList={{
            "border-accent bg-accent/10 text-accent": expanded(),
            "border-border bg-surface group-hover:border-accent/50 text-text-muted": !expanded(),
          }}
        >
          <StepToolIcon toolName={toolName()} isCustomTool={isCustomTool()} />
        </div>

        <div class="flex-1 min-w-0 py-1.5">
          <div class="flex items-center gap-2">
            <span class="text-2xs font-medium text-text-muted">Step {props.index + 1}</span>
            <Show when={!isCustomTool()}>
              <span class="text-2xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">system</span>
            </Show>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs font-medium text-text truncate">{props.step.label}</span>
            <span class="font-code text-2xs text-text-muted shrink-0">({toolName()})</span>
            <Show when={props.step.dependsOn.length > 0}>
              <div class="flex items-center gap-1 text-2xs text-text-muted shrink-0">
                <PlugsConnected class="h-3 w-3" />
                {props.step.dependsOn.join(", ")}
              </div>
            </Show>
          </div>
        </div>

        <span class="shrink-0 transition-transform" classList={{ "rotate-90": expanded() }}>
          <CaretRight class="h-4 w-4 text-text-muted" />
        </span>
      </button>

      <Show when={expanded()}>
        <div class="ml-11 mt-2 mb-4 rounded-lg border border-border overflow-hidden bg-surface">
          <Show when={toolDef()?.description}>
            <div class="px-3 py-2.5 border-b border-border bg-surface-muted/50">
              <p class="text-xs text-text-muted leading-relaxed">{toolDef()!.description}</p>
            </div>
          </Show>
          <Show when={hasParams()}>
            <div class="px-3 py-2.5 border-b border-border">
              <div class="flex items-center gap-1.5 mb-2">
                <BracketsCurly class="h-3 w-3 text-text-muted" />
                <span class="text-2xs font-medium text-text-muted">Parameters</span>
              </div>
              <pre class="font-code text-2xs text-text-secondary whitespace-pre-wrap overflow-x-auto bg-surface-muted rounded p-2">
                {JSON.stringify(resolveParams(params()), null, 2)}
              </pre>
            </div>
          </Show>
          <Show when={toolDef()?.code}>
            <div class="max-h-48 overflow-y-auto">
              <CodeEditor value={toolDef()!.code} language="javascript" readonly />
            </div>
          </Show>
          <Show when={!isCustomTool() && !hasParams()}>
            <div class="px-3 py-3 text-xs text-text-muted flex items-center gap-2">
              <Function class="h-3.5 w-3.5" />
              Built-in system tool
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function FieldContent(props: {
  field: HumanRequestFieldConfig
  value: unknown
  onChange: (value: unknown) => void
  touched?: Record<string, boolean>
  onBlur?: (name: string) => void
}) {
  return (
    <Switch>
      <Match when={props.field.kind === "form"}>
        <FormField
          config={props.field as HumanRequestFormConfig & { key: string }}
          value={
            (props.value as Record<string, unknown>) ??
            extractDefaults(
              (props.field as HumanRequestFormConfig).schema as JSONSchema,
              ((props.field as HumanRequestFormConfig).schema as JSONSchema)?.required ?? [],
            )
          }
          onChange={(v) => props.onChange(v)}
          touched={props.touched ?? {}}
          onBlur={(name) => props.onBlur?.(name)}
        />
      </Match>
      <Match when={props.field.kind === "question"}>
        <QuestionField
          config={props.field as HumanRequestQuestionConfig & { key: string }}
          value={(props.value as Record<string, unknown>) ?? {}}
          onChange={(v) => props.onChange(v)}
        />
      </Match>
      <Match when={props.field.kind === "select_rows"}>
        <SelectRowsField
          config={props.field as HumanRequestSelectRowsConfig & { key: string }}
          value={(props.value as number[]) ?? []}
          onChange={(v) => props.onChange(v)}
        />
      </Match>
    </Switch>
  )
}

function PendingInputForm(props: {
  config: PendingInputConfig
  onSubmit: (response: Record<string, unknown>) => void
  submitting?: boolean
}) {
  const fields = () => props.config.fields

  const initResponses = () =>
    Object.fromEntries(
      fields()
        .filter((f) => f.kind === "form")
        .map((f) => {
          const schema = (f as HumanRequestFormConfig).schema as JSONSchema
          return [f.key, extractDefaults(schema, schema?.required ?? [])]
        }),
    )

  const [responses, setResponses] = createSignal<Record<string, unknown>>(initResponses())
  const [touched, setTouched] = createSignal<Record<string, Record<string, boolean>>>({})

  const handleFieldChange = (key: string, value: unknown) => {
    setResponses((prev) => ({ ...prev, [key]: value }))
  }

  const handleFieldBlur = (fieldKey: string, propertyName: string) => {
    setTouched((prev) => ({
      ...prev,
      [fieldKey]: { ...(prev[fieldKey] ?? {}), [propertyName]: true },
    }))
  }

  const setAllTouched = () => {
    const allTouched: Record<string, Record<string, boolean>> = {}
    for (const field of fields()) {
      if (field.kind === "form") {
        const schema = (field as HumanRequestFormConfig).schema as JSONSchema
        const properties = schema?.properties ?? {}
        allTouched[field.key] = {}
        for (const name of Object.keys(properties)) {
          allTouched[field.key][name] = true
        }
      }
    }
    setTouched(allTouched)
  }

  const validateFormField = (field: HumanRequestFormConfig, value: Record<string, unknown>) => {
    const schema = field.schema as JSONSchema
    const properties = schema?.properties ?? {}
    const required = schema?.required ?? []
    for (const [name, fieldSchema] of Object.entries(properties)) {
      const error = validateFieldValue(value[name], fieldSchema, required.includes(name))
      if (error) return error
    }
    return null
  }

  const isFormValid = () => {
    for (const field of fields()) {
      if (field.kind === "form") {
        const val = (responses()[field.key] as Record<string, unknown>) ?? {}
        const error = validateFormField(field as HumanRequestFormConfig, val)
        if (error) return false
      }
    }
    return true
  }

  const formatResponses = () => {
    const result: Record<string, unknown> = {}
    for (const field of fields()) {
      const val = responses()[field.key]
      if (field.kind === "question") {
        const raw = val as Record<string, unknown> | undefined
        if (!raw) continue
        const questions = (field as HumanRequestQuestionConfig).questions
        const otherTexts = (raw.__otherTexts as Record<number, string>) ?? {}
        const answers: Record<string, unknown> = {}
        questions.forEach((q, idx) => {
          const selected = (raw[idx] as string[]) ?? []
          if (selected.includes("__other__")) {
            answers[q.header] = otherTexts[idx] ?? ""
          } else if (q.multiSelect) {
            answers[q.header] = selected
          } else {
            answers[q.header] = selected[0] ?? null
          }
        })
        result[field.key] = { answers }
      } else if (field.kind === "select_rows") {
        const indices = (val as number[]) ?? []
        const data = (field as HumanRequestSelectRowsConfig).data ?? []
        result[field.key] = { selectedRows: indices.map((i) => data[i]) }
      } else if (field.kind === "form") {
        result[field.key] = { values: val ?? {} }
      } else {
        result[field.key] = val
      }
    }
    return result
  }

  const handleSubmit = () => {
    setAllTouched()
    if (!isFormValid()) return
    props.onSubmit({ responses: formatResponses() })
  }

  return (
    <div class="space-y-3">
      <For each={fields()}>
        {(field) => (
          <div class="rounded-lg border border-border bg-surface p-3">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-medium text-text">{field.key}</span>
              <Badge variant="secondary" class="text-2xs">
                {field.kind}
              </Badge>
            </div>
            <FieldContent
              field={field}
              value={responses()[field.key]}
              onChange={(v) => handleFieldChange(field.key, v)}
              touched={touched()[field.key] ?? {}}
              onBlur={(name) => handleFieldBlur(field.key, name)}
            />
          </div>
        )}
      </For>
      <div class="flex justify-end">
        <Button size="sm" class="h-7 text-xs" onClick={handleSubmit} disabled={props.submitting || !isFormValid()}>
          <Show when={props.submitting} fallback="Submit">
            <Spinner size="xs" class="border-white border-t-transparent" />
            Submitting...
          </Show>
        </Button>
      </div>
    </div>
  )
}

function StepResultItem(props: {
  stepId: string
  result: unknown
  resolvedParams?: Record<string, unknown>
  recipe: Recipe
  isOutput: boolean
  index: number
  isLast: boolean
  tools?: ToolDef[]
  failed?: boolean
}) {
  const step = () => props.recipe.steps.find((s) => s.stepKey === props.stepId)
  const outputDef = () => props.recipe.outputs.find((o) => o.stepId === props.stepId)
  const [expanded, setExpanded] = createSignal(props.isOutput || props.failed)
  const [paramsExpanded, setParamsExpanded] = createSignal(false)
  const hasParams = () => props.resolvedParams && Object.keys(props.resolvedParams).length > 0
  const toolName = () => (step() ? getToolName(step()!) : props.stepId)
  const isCustomTool = () => !!props.tools?.find((t) => t.name === toolName())

  const asOutputItem = (): OutputItem | null => {
    const def = outputDef()
    if (!def) return null
    const resultData = props.result as Record<string, unknown> | null
    if (!resultData) return null
    return {
      id: props.stepId,
      kind: def.kind,
      name: def.name ?? null,
      payload: resultData,
      toolCallId: null,
      runId: null,
      threadId: "",
      createdAt: new Date().toISOString(),
    } as unknown as OutputItem
  }

  const outputItem = () => asOutputItem()
  const isOutputStep = () => !!outputItem()

  return (
    <div class="relative">
      <Show when={!props.isLast}>
        <div class="absolute left-[15px] top-[32px] bottom-[-8px] w-px bg-border" />
      </Show>

      <button
        type="button"
        class="flex items-center gap-3 w-full text-left group"
        onClick={() => setExpanded(!expanded())}
      >
        <div
          class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors"
          classList={{
            "border-danger bg-danger/10 text-danger": props.failed,
            "border-success bg-success/10 text-success": !props.failed && !expanded(),
            "border-accent bg-accent/10 text-accent": !props.failed && expanded(),
          }}
        >
          <Show when={props.failed} fallback={<StepToolIcon toolName={toolName()} isCustomTool={isCustomTool()} />}>
            <XCircle class="h-4 w-4" weight="fill" />
          </Show>
        </div>

        <div class="flex-1 min-w-0 py-1.5">
          <div class="flex items-center gap-2">
            <span class="text-2xs font-medium text-text-muted">Step {props.index + 1}</span>
            <Show when={props.failed}>
              <span class="text-2xs text-danger bg-danger/10 px-1.5 py-0.5 rounded">failed</span>
            </Show>
            <Show when={isOutputStep() && !props.failed}>
              <span class="text-2xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">output</span>
            </Show>
            <Show when={!props.failed}>
              <CheckCircle class="h-3 w-3 text-success" weight="fill" />
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-text truncate">{step()?.label}</span>
            <span class="font-code text-2xs text-text-muted shrink-0">({toolName()})</span>
          </div>
        </div>

        <span class="shrink-0 transition-transform" classList={{ "rotate-90": expanded() }}>
          <CaretRight class="h-4 w-4 text-text-muted" />
        </span>
      </button>

      <Show when={expanded()}>
        <div class="ml-11 mt-2 mb-4 rounded-lg border border-border overflow-hidden bg-surface">
          <Show when={hasParams()}>
            <div class="border-b border-border">
              <button
                type="button"
                class="flex items-center gap-1.5 w-full px-3 py-2 hover:bg-surface-muted/50 transition-colors"
                onClick={() => setParamsExpanded(!paramsExpanded())}
              >
                <span class="transition-transform" classList={{ "rotate-90": paramsExpanded() }}>
                  <CaretRight class="h-3 w-3 text-text-muted" />
                </span>
                <BracketsCurly class="h-3 w-3 text-text-muted" />
                <span class="text-2xs font-medium text-text-muted">Parameters</span>
              </button>
              <Show when={paramsExpanded()}>
                <div class="px-3 pb-2.5">
                  <pre class="font-code text-2xs text-text-secondary whitespace-pre-wrap overflow-x-auto bg-surface-muted rounded p-2 max-h-32 overflow-y-auto">
                    {JSON.stringify(props.resolvedParams, null, 2)}
                  </pre>
                </div>
              </Show>
            </div>
          </Show>
          <Show
            when={outputItem()}
            fallback={
              <div class="px-3 py-2.5">
                <div class="flex items-center gap-1.5 mb-2">
                  <Export class="h-3 w-3 text-text-muted" />
                  <span class="text-2xs font-medium text-text-muted">Result</span>
                </div>
                <pre class="font-code text-2xs text-text-secondary whitespace-pre-wrap overflow-x-auto bg-surface-muted rounded p-2 max-h-32 overflow-y-auto">
                  {JSON.stringify(props.result, null, 2)}
                </pre>
              </div>
            }
          >
            {(item) => (
              <div class="px-3 py-2.5">
                <OutputItemRenderer item={item()} />
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

function ResultDisplay(props: {
  stepResults: Record<string, unknown>
  resolvedParams?: Record<string, Record<string, unknown>>
  recipe: Recipe
  tools?: ToolDef[]
  error?: RecipeExecutionError
}) {
  const failedStepKey = () => props.error?.stepKey

  const sortedSteps = createMemo(() => {
    const stepOrder = new Map(props.recipe.steps.map((s, i) => [s.stepKey, i]))
    const entries = Object.entries(props.stepResults)
    const sorted = entries.sort(([a], [b]) => {
      const aOrder = stepOrder.get(a) ?? Number.MAX_VALUE
      const bOrder = stepOrder.get(b) ?? Number.MAX_VALUE
      return aOrder - bOrder
    })
    if (failedStepKey() && !props.stepResults[failedStepKey()!]) {
      sorted.push([failedStepKey()!, null])
    }
    return sorted
  })

  const outputStepIds = createMemo(() => new Set(props.recipe.outputs.map((o) => o.stepId)))

  return (
    <div class="space-y-3">
      <Show when={props.error}>
        {(err) => {
          const failedStep = () => props.recipe.steps.find((s) => s.stepKey === err().stepKey)
          return (
            <div class="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
              <div class="flex items-center gap-2 mb-1.5">
                <XCircle class="h-4 w-4 text-danger" weight="fill" />
                <span class="text-xs font-medium text-danger">
                  Step "{failedStep()?.label ?? err().stepKey}" ({err().toolName}) failed
                </span>
              </div>
              <p class="text-xs text-text leading-relaxed">{err().message}</p>
            </div>
          )
        }}
      </Show>

      <div class="pl-1">
        <For each={sortedSteps()}>
          {([stepId, result], index) => (
            <StepResultItem
              stepId={stepId}
              result={result}
              resolvedParams={props.resolvedParams?.[stepId]}
              recipe={props.recipe}
              isOutput={outputStepIds().has(stepId)}
              index={index()}
              isLast={index() === sortedSteps().length - 1}
              tools={props.tools}
              failed={stepId === failedStepKey()}
            />
          )}
        </For>
      </div>
    </div>
  )
}

function ExecutionRow(props: {
  execution: RecipeExecution
  recipe: Recipe
  isLatest?: boolean
  onRespond?: (executionId: string, response: Record<string, unknown>) => void
  responding?: boolean
  tools?: ToolDef[]
}) {
  const [expanded, setExpanded] = createSignal(true)
  const hasResults = () => {
    const results = props.execution.results as Record<string, unknown> | null
    return results && Object.keys(results).length > 0
  }
  const isWaitingInput = () => !!props.execution.pendingInputConfig

  const handleRespond = (response: Record<string, unknown>) => {
    props.onRespond?.(props.execution.id, response)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  return (
    <div class="rounded-lg border transition-colors border-warning/30 bg-warning/5">
      <button
        type="button"
        class="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-muted/50 rounded-lg"
        classList={{ "rounded-b-none": expanded() }}
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border">
          <HourglassHigh class="h-4 w-4 text-warning" weight="fill" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-text">Waiting for input</span>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-2xs text-text-muted">{formatDate(props.execution.createdAt)}</span>
            <span class="text-2xs text-text-muted">·</span>
            <span class="font-code text-2xs text-text-muted">{props.execution.id.slice(0, 8)}</span>
          </div>
        </div>
        <span class="transition-transform" classList={{ "rotate-90": expanded() }}>
          <CaretRight class="h-4 w-4 text-text-muted" />
        </span>
      </button>
      <Show when={expanded()}>
        <div class="border-t border-border/50 px-3 py-3 bg-surface/50 rounded-b-lg">
          <Show
            when={isWaitingInput() && props.execution.pendingInputConfig}
            fallback={
              <ResultDisplay
                stepResults={(props.execution.results ?? {}) as Record<string, unknown>}
                recipe={props.recipe}
                tools={props.tools}
              />
            }
          >
            <PendingInputForm
              config={props.execution.pendingInputConfig as unknown as PendingInputConfig}
              onSubmit={handleRespond}
              submitting={props.responding}
            />
          </Show>
        </div>
      </Show>
    </div>
  )
}

function EmptyState() {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 p-8">
      <div class="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">
        <ListChecks class="h-7 w-7 text-text-muted opacity-40" />
      </div>
      <div class="text-center">
        <p class="text-[13px] font-medium text-text">Select a recipe</p>
        <p class="mt-0.5 text-xs text-text-muted">Choose a recipe from the list to view details</p>
      </div>
    </div>
  )
}

type RecipeDetailProps = {
  recipe: Recipe | null
  pendingExecution: RecipeExecution | null
  lastResult: LastResult | null
  agents: Agents
  environments: Environments
  selectedEnvironmentId: string | null
  onEnvironmentChange: (environmentId: string) => void
  loading?: boolean
  onUpdateName?: (name: string) => Promise<void>
  onUpdateDescription?: (description: string) => Promise<void>
  onExecute?: (inputs: Record<string, unknown>) => void
  executing?: boolean
  onRespond?: (executionId: string, response: Record<string, unknown>) => void
  responding?: boolean
}

export function RecipeDetail(props: RecipeDetailProps) {
  const [activeTab, setActiveTab] = createSignal<Tab>("configuration")
  const [editModalOpen, setEditModalOpen] = createSignal(false)
  const [editedName, setEditedName] = createSignal("")
  const [editedDescription, setEditedDescription] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [inputModalOpen, setInputModalOpen] = createSignal(false)
  const [inputValues, setInputValues] = createSignal<Record<string, unknown>>({})

  const agent = createMemo(() => {
    if (!props.recipe) return null
    return props.agents.find((a) => a.id === props.recipe?.agentId) ?? null
  })

  const environmentOptions = createMemo((): SelectOption<string>[] =>
    props.environments.map((env) => ({
      value: env.id,
      label: env.name,
    })),
  )

  createEffect(
    on(
      () => props.recipe?.id,
      () => {
        setActiveTab("configuration")
      },
    ),
  )

  createEffect(
    on(
      () => props.lastResult,
      (result) => {
        if (result) {
          setActiveTab("result")
        }
      },
    ),
  )

  const openEditModal = () => {
    if (!props.recipe) return
    setEditedName(props.recipe.name)
    setEditedDescription(props.recipe.description ?? "")
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!props.recipe) return
    const name = editedName().trim()
    const description = editedDescription().trim()
    if (!name) return

    setSaving(true)
    try {
      if (name !== props.recipe.name) {
        await props.onUpdateName?.(name)
      }
      if (description !== (props.recipe.description ?? "")) {
        await props.onUpdateDescription?.(description)
      }
      setEditModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleExecute = () => {
    if (!props.recipe) return
    if (props.recipe.inputs.length > 0) {
      const defaults: Record<string, unknown> = {}
      for (const input of props.recipe.inputs) {
        defaults[input.key] = input.defaultValue ?? ""
      }
      setInputValues(defaults)
      setInputModalOpen(true)
    } else {
      props.onExecute?.({})
    }
  }

  const isInputValid = () => {
    if (!props.recipe) return false
    for (const input of props.recipe.inputs) {
      if (input.required) {
        const val = inputValues()[input.key]
        if (val === undefined || val === null || val === "") return false
      }
    }
    return true
  }

  const handleInputSubmit = () => {
    if (!isInputValid()) return
    props.onExecute?.(inputValues())
    setInputModalOpen(false)
  }

  const handleInputChange = (key: string, value: unknown) => {
    setInputValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div class="flex flex-1 flex-col overflow-hidden bg-surface-elevated">
      <Show when={!props.recipe}>
        <EmptyState />
      </Show>
      <Show when={props.recipe}>
        {(recipe) => (
          <>
            <div class="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-2.5">
              <div class="relative">
                <EntityIcon
                  icon={agent()?.icon ?? null}
                  iconColor={agent()?.iconColor ?? null}
                  size={24}
                  rounded="md"
                />
                <div class="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-surface-elevated shadow-sm">
                  <ListChecks class="h-2.5 w-2.5 text-text-muted" weight="bold" />
                </div>
              </div>
              <div class="flex flex-col min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="group flex items-center gap-1 truncate rounded px-1 py-0.5 -ml-1 text-[13px] font-medium text-text hover:bg-surface-muted transition-colors"
                    onClick={openEditModal}
                  >
                    {recipe().name}
                    <PencilSimple class="h-3 w-3 text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                </div>
                <div class="flex items-center gap-1.5 text-2xs text-text-muted">
                  <span>{agent()?.name ?? "Agent"}</span>
                  <span>·</span>
                  <span>{recipe().steps.length} steps</span>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Select
                  value={props.selectedEnvironmentId ?? undefined}
                  options={environmentOptions()}
                  onChange={props.onEnvironmentChange}
                  placeholder="Environment"
                  wrapperClass="w-32"
                />
                <Button
                  size="sm"
                  class="h-7 px-2.5 text-xs"
                  onClick={handleExecute}
                  disabled={props.executing || recipe().steps.length === 0 || !props.selectedEnvironmentId}
                >
                  <Show when={props.executing} fallback={<Play class="h-3.5 w-3.5" weight="fill" />}>
                    <Spinner size="xs" class="border-white border-t-transparent" />
                  </Show>
                  {props.executing ? "Running..." : "Run"}
                </Button>
              </div>
            </div>

            <div class="flex items-center border-b border-border px-4">
              <button
                type="button"
                class="-mb-px border-b px-0.5 py-2 text-xs font-medium transition-colors"
                classList={{
                  "border-accent text-text": activeTab() === "configuration",
                  "border-transparent text-text-muted hover:text-text": activeTab() !== "configuration",
                }}
                onClick={() => setActiveTab("configuration")}
              >
                Configuration
              </button>
              <button
                type="button"
                class="-mb-px ml-4 border-b px-0.5 py-2 text-xs font-medium transition-colors"
                classList={{
                  "border-accent text-text": activeTab() === "result",
                  "border-transparent text-text-muted hover:text-text": activeTab() !== "result",
                }}
                onClick={() => setActiveTab("result")}
              >
                Result
                <Show when={props.lastResult?.status === "waiting_input" || props.pendingExecution}>
                  <Badge variant="warning" class="ml-1.5">
                    Input required
                  </Badge>
                </Show>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto scrollbar-thin">
              <Show when={activeTab() === "configuration"}>
                <div class="flex flex-col gap-6 px-4 py-4">
                  <Show when={recipe().description}>
                    <div class="rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5">
                      <p class="text-xs text-text-muted leading-relaxed">{recipe().description}</p>
                    </div>
                  </Show>

                  <div>
                    <div class="flex items-center gap-2 mb-3">
                      <div class="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
                        <LineSegments class="h-3.5 w-3.5 text-accent" />
                      </div>
                      <h3 class="text-xs font-medium text-text">Workflow</h3>
                      <span class="text-2xs text-text-muted">{recipe().steps.length} steps</span>
                    </div>
                    <Show
                      when={recipe().steps.length > 0}
                      fallback={
                        <div class="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center">
                          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted mx-auto mb-2">
                            <Function class="h-5 w-5 text-text-muted opacity-50" />
                          </div>
                          <p class="text-xs text-text-muted">No steps defined yet</p>
                        </div>
                      }
                    >
                      <div class="pl-1">
                        <For each={recipe().steps}>
                          {(step, index) => (
                            <StepItem
                              step={step}
                              index={index()}
                              tools={agent()?.runtimeConfig?.tools}
                              isLast={index() === recipe().steps.length - 1}
                              totalSteps={recipe().steps.length}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>

                  <div>
                    <div class="flex items-center gap-2 mb-3">
                      <div class="flex h-6 w-6 items-center justify-center rounded-md bg-success/10">
                        <SignIn class="h-3.5 w-3.5 text-success" />
                      </div>
                      <h3 class="text-xs font-medium text-text">Inputs</h3>
                      <span class="text-2xs text-text-muted">{recipe().inputs.length} fields</span>
                    </div>
                    <Show
                      when={recipe().inputs.length > 0}
                      fallback={
                        <div class="rounded-lg border border-dashed border-border bg-surface px-4 py-4 text-center">
                          <p class="text-xs text-text-muted">No inputs required</p>
                        </div>
                      }
                    >
                      <div class="grid gap-2">
                        <For each={recipe().inputs}>
                          {(input) => (
                            <div class="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 group hover:border-accent/30 transition-colors">
                              <div class="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted group-hover:bg-accent/10 transition-colors">
                                {input.type === "number" ? (
                                  <Hash class="h-3.5 w-3.5 text-text-muted group-hover:text-accent transition-colors" />
                                ) : (
                                  <TextT class="h-3.5 w-3.5 text-text-muted group-hover:text-accent transition-colors" />
                                )}
                              </div>
                              <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                  <span class="font-code text-xs text-text">{input.key}</span>
                                  <Show when={input.required}>
                                    <span class="text-2xs text-warning">*</span>
                                  </Show>
                                </div>
                                <span class="text-2xs text-text-muted">{input.type}</span>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>

                  <Show when={recipe().outputs.length > 0}>
                    <div>
                      <div class="flex items-center gap-2 mb-3">
                        <div class="flex h-6 w-6 items-center justify-center rounded-md bg-warning/10">
                          <Export class="h-3.5 w-3.5 text-warning" />
                        </div>
                        <h3 class="text-xs font-medium text-text">Outputs</h3>
                        <span class="text-2xs text-text-muted">{recipe().outputs.length} items</span>
                      </div>
                      <div class="grid gap-2">
                        <For each={recipe().outputs}>
                          {(output) => (
                            <div class="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 group hover:border-warning/30 transition-colors">
                              <div class="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted group-hover:bg-warning/10 transition-colors">
                                <Switch>
                                  <Match when={output.kind === "table"}>
                                    <Table class="h-3.5 w-3.5 text-text-muted group-hover:text-warning transition-colors" />
                                  </Match>
                                  <Match when={output.kind === "chart"}>
                                    <ChartLine class="h-3.5 w-3.5 text-text-muted group-hover:text-warning transition-colors" />
                                  </Match>
                                  <Match when={output.kind === "markdown"}>
                                    <TextAa class="h-3.5 w-3.5 text-text-muted group-hover:text-warning transition-colors" />
                                  </Match>
                                  <Match when={output.kind === "key_value"}>
                                    <ListDashes class="h-3.5 w-3.5 text-text-muted group-hover:text-warning transition-colors" />
                                  </Match>
                                  <Match when={true}>
                                    <Export class="h-3.5 w-3.5 text-text-muted group-hover:text-warning transition-colors" />
                                  </Match>
                                </Switch>
                              </div>
                              <div class="flex-1 min-w-0">
                                <span class="text-xs text-text">{output.name ?? output.kind}</span>
                                <div class="text-2xs text-text-muted">{output.kind}</div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>

              <Show when={activeTab() === "result"}>
                <div class="p-4">
                  <Show
                    when={props.lastResult}
                    fallback={
                      <Show
                        when={props.pendingExecution}
                        fallback={
                          <div class="flex flex-col items-center justify-center py-8 text-center">
                            <p class="text-xs text-text-muted">No results yet</p>
                          </div>
                        }
                      >
                        {(execution) => (
                          <div class="rounded-lg border border-warning/30 bg-warning/5 p-4">
                            <div class="flex items-center gap-2 mb-3">
                              <HourglassHigh class="h-4 w-4 text-warning" weight="fill" />
                              <span class="text-xs font-medium text-text">Waiting for input</span>
                            </div>
                            <Show when={execution().pendingInputConfig}>
                              <PendingInputForm
                                config={execution().pendingInputConfig as unknown as PendingInputConfig}
                                onSubmit={(response) => props.onRespond?.(execution().id, response)}
                                submitting={props.responding}
                              />
                            </Show>
                          </div>
                        )}
                      </Show>
                    }
                  >
                    {(result) => {
                      const statusConfig = () => {
                        switch (result().status) {
                          case "completed":
                            return {
                              label: "Completed",
                              color: "border-success/30 bg-success/5",
                              icon: CheckCircle,
                              iconColor: "text-success",
                            }
                          case "failed":
                            return {
                              label: "Failed",
                              color: "border-danger/30 bg-danger/5",
                              icon: XCircle,
                              iconColor: "text-danger",
                            }
                          case "waiting_input":
                            return {
                              label: "Waiting for input",
                              color: "border-warning/30 bg-warning/5",
                              icon: HourglassHigh,
                              iconColor: "text-warning",
                            }
                          default:
                            return {
                              label: "Unknown",
                              color: "border-border bg-surface",
                              icon: Clock,
                              iconColor: "text-text-muted",
                            }
                        }
                      }

                      const formatDuration = (ms: number) => {
                        if (ms < 1000) return `${ms}ms`
                        const seconds = ms / 1000
                        if (seconds < 60) return `${seconds.toFixed(1)}s`
                        const minutes = Math.floor(seconds / 60)
                        const remainingSeconds = Math.round(seconds % 60)
                        return `${minutes}m ${remainingSeconds}s`
                      }

                      return (
                        <div class={`rounded-lg border transition-colors ${statusConfig().color}`}>
                          <div class="flex items-center gap-3 px-3 py-3">
                            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border">
                              {(() => {
                                const Icon = statusConfig().icon
                                return <Icon class={`h-4 w-4 ${statusConfig().iconColor}`} weight="fill" />
                              })()}
                            </div>
                            <div class="flex-1 min-w-0">
                              <span class="text-xs font-medium text-text">{statusConfig().label}</span>
                              <Show when={result().durationMs}>
                                {(duration) => (
                                  <p class="text-2xs text-text-muted mt-0.5">
                                    Executed in {formatDuration(duration())}
                                  </p>
                                )}
                              </Show>
                            </div>
                          </div>

                          <Show
                            when={
                              result().status === "waiting_input" && result().pendingInputConfig && result().executionId
                            }
                          >
                            <div class="border-t border-border/50 px-3 py-3 bg-surface/50">
                              <PendingInputForm
                                config={result().pendingInputConfig as unknown as PendingInputConfig}
                                onSubmit={(response) => props.onRespond?.(result().executionId!, response)}
                                submitting={props.responding}
                              />
                            </div>
                          </Show>

                          <Show
                            when={
                              result().error || (result().stepResults && Object.keys(result().stepResults!).length > 0)
                            }
                          >
                            <div class="border-t border-border/50 px-3 py-3 bg-surface/50">
                              <ResultDisplay
                                stepResults={result().stepResults ?? {}}
                                resolvedParams={result().resolvedParams}
                                recipe={recipe()}
                                tools={agent()?.runtimeConfig?.tools}
                                error={result().error}
                              />
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </Show>
                </div>
              </Show>
            </div>

            <Modal
              open={editModalOpen()}
              onBackdropClick={() => setEditModalOpen(false)}
              onEscape={() => setEditModalOpen(false)}
            >
              <ModalContainer size="sm">
                <ModalHeader title="Edit recipe" onClose={() => setEditModalOpen(false)} />
                <ModalBody>
                  <div class="flex flex-col gap-3">
                    <div class="flex items-center gap-2">
                      <label class="w-20 shrink-0 text-xs text-text-muted">Name</label>
                      <Input
                        type="text"
                        value={editedName()}
                        onInput={(e) => setEditedName(e.currentTarget.value)}
                        class="h-7 flex-1 text-xs"
                        autofocus
                      />
                    </div>
                    <div class="flex items-start gap-2">
                      <label class="w-20 shrink-0 pt-1.5 text-xs text-text-muted">Description</label>
                      <Textarea
                        value={editedDescription()}
                        onInput={(e) => setEditedDescription(e.currentTarget.value)}
                        rows={3}
                        placeholder="Optional description"
                        class="flex-1"
                      />
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="ghost" size="sm" onClick={() => setEditModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={saving() || !editedName().trim()}
                  >
                    <Show when={saving()}>
                      <Spinner size="xs" class="border-white border-t-transparent" />
                    </Show>
                    {saving() ? "Saving..." : "Save"}
                  </Button>
                </ModalFooter>
              </ModalContainer>
            </Modal>

            <Modal
              open={inputModalOpen()}
              onBackdropClick={() => setInputModalOpen(false)}
              onEscape={() => setInputModalOpen(false)}
            >
              <ModalContainer size="sm">
                <ModalHeader title="Run recipe" onClose={() => setInputModalOpen(false)} />
                <ModalBody>
                  <div class="flex flex-col gap-3">
                    <For each={recipe().inputs}>
                      {(input) => (
                        <div class="flex flex-col gap-1.5">
                          <label class="text-xs text-text-muted flex items-center gap-1">
                            {input.label ?? input.key}
                            <Show when={input.required}>
                              <span class="text-warning">*</span>
                            </Show>
                          </label>
                          <Input
                            type={input.type === "number" ? "number" : "text"}
                            value={String(inputValues()[input.key] ?? "")}
                            onInput={(e) => {
                              const v = e.currentTarget.value
                              if (input.type === "number") {
                                handleInputChange(input.key, v === "" ? undefined : Number(v))
                              } else {
                                handleInputChange(input.key, v)
                              }
                            }}
                            class="h-8 text-xs"
                            placeholder={input.description}
                          />
                        </div>
                      )}
                    </For>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="ghost" size="sm" onClick={() => setInputModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleInputSubmit}
                    disabled={props.executing || !isInputValid()}
                  >
                    <Show when={props.executing} fallback={<Play class="h-3.5 w-3.5" weight="fill" />}>
                      <Spinner size="xs" class="border-white border-t-transparent" />
                    </Show>
                    {props.executing ? "Running..." : "Run"}
                  </Button>
                </ModalFooter>
              </ModalContainer>
            </Modal>
          </>
        )}
      </Show>
    </div>
  )
}
