import { createSignal, Show, For, Switch, Match } from "solid-js"
import { Button, Badge, Spinner, Textarea, type JSONSchema } from "../../ui"
import { CaretDown, CaretRight, CheckCircle, Clock, X } from "phosphor-solid-js"
import { FormField, extractDefaults, validateFieldValue } from "./form-field"
import { QuestionField } from "./question-field"
import { SelectRowsField } from "./select-rows-field"
import { ConfirmField } from "./confirm-field"
import { getIconComponent, ICON_COLORS } from "../index"
import { Robot } from "phosphor-solid-js"
import type {
  HumanRequestFieldConfig,
  HumanRequestFormConfig,
  HumanRequestQuestionConfig,
  HumanRequestSelectRowsConfig,
  HumanRequestConfirmConfig,
} from "@synatra/core/types"
import type { ThreadHumanRequest } from "../../app/api"

export { SubmittedFieldsPanel } from "./submitted-panel"

type SubagentInfo = {
  name: string
  icon: string | null
  iconColor: string | null
}

type FieldsPanelProps = {
  request: ThreadHumanRequest
  remainingTime?: string | null
  onSubmit: (data: { responses: Record<string, unknown> }) => void
  onSkip?: (reason: string) => void
  responding?: boolean
  subagent?: SubagentInfo | null
}

type FieldContentProps = {
  field: HumanRequestFieldConfig
  value: unknown
  onChange: (value: unknown) => void
  touched?: Record<string, boolean>
  onBlur?: (name: string) => void
}

function FieldContent(props: FieldContentProps) {
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
      <Match when={props.field.kind === "confirm"}>
        <ConfirmField
          config={props.field as HumanRequestConfirmConfig & { key: string }}
          value={props.value as { confirmed: boolean; reason?: string } | null}
          onChange={(v) => props.onChange(v)}
        />
      </Match>
    </Switch>
  )
}

const KIND_LABELS: Record<string, string> = {
  form: "Form",
  question: "Question",
  select_rows: "Select",
  confirm: "Confirm",
}

function FieldSection(props: FieldContentProps & { index: number; completed: boolean }) {
  const [expanded, setExpanded] = createSignal(true)

  return (
    <div class="rounded-lg border border-border bg-surface">
      <button
        type="button"
        class="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-surface-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="w-4 h-4 flex items-center justify-center shrink-0">
          <Show when={props.completed} fallback={<span class="text-2xs text-text-muted">{props.index + 1}</span>}>
            <CheckCircle class="h-4 w-4 text-success" weight="fill" />
          </Show>
        </div>
        <span class="text-xs font-medium text-text flex-1">{props.field.key}</span>
        <Badge variant="secondary" class="text-2xs">
          {KIND_LABELS[props.field.kind] ?? "Input"}
        </Badge>
        {expanded() ? <CaretDown class="h-3 w-3 text-text-muted" /> : <CaretRight class="h-3 w-3 text-text-muted" />}
      </button>

      <Show when={expanded()}>
        <div class="px-3 pb-3 pt-2 border-t border-border">
          <FieldContent
            field={props.field}
            value={props.value}
            onChange={props.onChange}
            touched={props.touched}
            onBlur={props.onBlur}
          />
        </div>
      </Show>
    </div>
  )
}

function SubagentHeader(props: { subagent: SubagentInfo }) {
  const color = () => ICON_COLORS.find((c) => c.id === props.subagent.iconColor)?.value ?? ICON_COLORS[0].value
  const IconComponent = props.subagent.icon ? getIconComponent(props.subagent.icon) : null

  return (
    <div
      class="flex items-center gap-2 mb-3 pb-2 border-b"
      style={{ "border-color": `color-mix(in srgb, ${color()} 20%, transparent)` }}
    >
      <span
        class="flex shrink-0 items-center justify-center rounded-full"
        style={{
          width: "20px",
          height: "20px",
          "background-color": `color-mix(in srgb, ${color()} 15%, transparent)`,
        }}
      >
        {IconComponent ? (
          <IconComponent size={11} weight="duotone" style={{ color: color() }} />
        ) : (
          <Robot size={11} weight="duotone" style={{ color: color() }} />
        )}
      </span>
      <div class="flex items-baseline gap-1">
        <span class="text-xs font-medium" style={{ color: color() }}>
          {props.subagent.name}
        </span>
        <span class="text-2xs text-text-muted">is asking</span>
      </div>
    </div>
  )
}

export function FieldsPanel(props: FieldsPanelProps) {
  const fields = () => props.request.config?.fields ?? []
  const isSingleField = () => fields().length === 1

  const initResponses = () => {
    const result: Record<string, unknown> = {}
    for (const field of props.request.config?.fields ?? []) {
      if (field.kind === "form") {
        const schema = (field as HumanRequestFormConfig).schema as JSONSchema
        result[field.key] = extractDefaults(schema, schema?.required ?? [])
      }
    }
    return result
  }

  const [responses, setResponses] = createSignal<Record<string, unknown>>(initResponses())
  const [touched, setTouched] = createSignal<Record<string, Record<string, boolean>>>({})
  const [skipMode, setSkipMode] = createSignal(false)
  const [skipReason, setSkipReason] = createSignal("")

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

  const isFieldCompleted = (field: HumanRequestFieldConfig) => {
    const val = responses()[field.key]
    if (val === undefined || val === null) return false
    if (field.kind === "form") {
      const error = validateFormField(field as HumanRequestFormConfig, (val as Record<string, unknown>) ?? {})
      return error === null
    }
    if (field.kind === "question") {
      const v = val as Record<string, unknown>
      const questions = (field as HumanRequestQuestionConfig).questions
      const otherTexts = (v.__otherTexts as Record<number, string>) ?? {}
      return questions.every((_, idx) => {
        const answers = (v[idx] as string[]) ?? []
        if (answers.length === 0) return false
        if (answers.includes("__other__")) return (otherTexts[idx] ?? "").trim().length > 0
        return true
      })
    }
    if (field.kind === "select_rows") {
      return ((val as number[]) ?? []).length > 0
    }
    if (field.kind === "confirm") {
      const v = val as { confirmed?: boolean } | null
      return v !== null && typeof v.confirmed === "boolean"
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
      } else if (field.kind === "confirm") {
        result[field.key] = val ?? { confirmed: false }
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

  const handleSkip = () => {
    if (!skipReason().trim()) return
    props.onSkip?.(skipReason().trim())
  }

  return (
    <div class="rounded-lg border border-accent/50 bg-accent/5 p-3 space-y-3">
      <Show when={props.subagent}>{(sub) => <SubagentHeader subagent={sub()} />}</Show>
      <div class="flex flex-wrap items-center gap-1.5 mb-1">
        <Badge variant="default" class="text-2xs">
          {isSingleField() ? "Input needed" : "Multiple inputs"}
        </Badge>
        <Show when={!isSingleField()}>
          <span class="text-2xs text-text-muted">{fields().length} fields</span>
        </Show>
        <Show when={props.remainingTime}>
          <span class="flex items-center gap-0.5 text-2xs text-text-muted">
            <Clock class="h-3 w-3" />
            {props.remainingTime}
          </span>
        </Show>
      </div>

      <Show when={props.request.title}>
        <h4 class="text-sm font-medium text-text">{props.request.title}</h4>
      </Show>
      <Show when={props.request.description}>
        <p class="text-xs text-text-muted">{props.request.description}</p>
      </Show>

      <Show
        when={!isSingleField()}
        fallback={
          <FieldContent
            field={fields()[0]}
            value={responses()[fields()[0].key]}
            onChange={(v) => handleFieldChange(fields()[0].key, v)}
            touched={touched()[fields()[0].key] ?? {}}
            onBlur={(name) => handleFieldBlur(fields()[0].key, name)}
          />
        }
      >
        <div class="space-y-2">
          <For each={fields()}>
            {(field, idx) => (
              <FieldSection
                field={field}
                index={idx()}
                value={responses()[field.key]}
                onChange={(v) => handleFieldChange(field.key, v)}
                completed={isFieldCompleted(field)}
                touched={touched()[field.key] ?? {}}
                onBlur={(name) => handleFieldBlur(field.key, name)}
              />
            )}
          </For>
        </div>
      </Show>

      <div class="mt-4 pt-3 border-t border-border space-y-2">
        <Show when={skipMode()}>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-muted">Why are you skipping this request?</span>
              <button
                type="button"
                class="p-0.5 rounded hover:bg-surface-muted transition-colors"
                onClick={() => {
                  setSkipMode(false)
                  setSkipReason("")
                }}
              >
                <X class="h-3.5 w-3.5 text-text-muted" />
              </button>
            </div>
            <Textarea
              value={skipReason()}
              onInput={(e) => setSkipReason(e.currentTarget.value)}
              placeholder="Provide context for the agent..."
              rows={2}
              class="text-xs"
            />
          </div>
        </Show>
        <div class="flex items-center justify-end gap-1.5">
          <Show
            when={!skipMode()}
            fallback={
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSkip}
                disabled={props.responding || !skipReason().trim()}
                class="h-7 text-xs"
              >
                <Show when={props.responding} fallback={<span>Skip</span>}>
                  <Spinner size="xs" />
                  <span>Skipping...</span>
                </Show>
              </Button>
            }
          >
            <Show when={props.onSkip}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSkipMode(true)}
                disabled={props.responding}
                class="h-7 text-xs text-text-muted hover:text-text"
              >
                Other
              </Button>
            </Show>
          </Show>
          <Show when={!skipMode()}>
            <Button
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={props.responding || !isFormValid()}
              class="h-7 text-xs"
            >
              <Show when={props.responding} fallback={<span>Submit</span>}>
                <Spinner size="xs" class="border-white border-t-transparent" />
                <span>Sending...</span>
              </Show>
            </Button>
          </Show>
        </div>
      </div>
    </div>
  )
}
