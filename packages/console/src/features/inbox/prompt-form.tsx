import { Show, For, createMemo } from "solid-js"
import { X } from "phosphor-solid-js"
import { Button, Spinner, JSONSchemaField, extractDefaults, validateFieldValue, type JSONSchema } from "../../ui"
import { PromptPreview } from "./prompt-preview"
import type { AgentPrompt } from "../../app/api"

type PromptFormProps = {
  prompt: AgentPrompt
  formValues: Record<string, unknown>
  touched: Record<string, boolean>
  onFormChange: (values: Record<string, unknown>) => void
  onBlur: (name: string) => void
  onCancel: () => void
  onSubmit: () => void
  submitting: boolean
}

export function PromptForm(props: PromptFormProps) {
  const schema = () => props.prompt.inputSchema as JSONSchema | undefined
  const properties = () => schema()?.properties ?? {}
  const required = () => schema()?.required ?? []
  const hasFields = () => Object.keys(properties()).length > 0

  const getError = (name: string, fieldSchema: JSONSchema) => {
    if (!props.touched[name]) return undefined
    return validateFieldValue(props.formValues[name], fieldSchema, required().includes(name)) ?? undefined
  }

  const isValid = createMemo(() => {
    if (!hasFields()) return true
    for (const [name, fieldSchema] of Object.entries(properties())) {
      const error = validateFieldValue(props.formValues[name], fieldSchema as JSONSchema, required().includes(name))
      if (error) return false
    }
    return true
  })

  const handleFieldChange = (name: string, value: unknown) => {
    props.onFormChange({ ...props.formValues, [name]: value })
  }

  return (
    <div class="space-y-2 rounded border border-border bg-surface-muted px-3 py-2">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-xs font-medium text-text">{props.prompt.name}</div>
          <Show when={props.prompt.description}>
            <div class="text-2xs text-text-muted">{props.prompt.description}</div>
          </Show>
        </div>
        <button
          type="button"
          onClick={props.onCancel}
          class="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-surface hover:text-text"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <Show when={hasFields()}>
        <div class="space-y-2">
          <For each={Object.entries(properties())}>
            {([name, fieldSchema]) => (
              <JSONSchemaField
                name={name}
                schema={fieldSchema as JSONSchema}
                required={required().includes(name)}
                value={props.formValues[name]}
                onChange={(val) => handleFieldChange(name, val)}
                onBlur={() => props.onBlur(name)}
                error={getError(name, fieldSchema as JSONSchema)}
                compact
              />
            )}
          </For>
        </div>
      </Show>

      <PromptPreview
        mode={(props.prompt.mode as "template" | "script") ?? "template"}
        template={props.prompt.content ?? ""}
        script={props.prompt.script ?? null}
        values={props.formValues}
        collapsed={hasFields()}
      />

      <Button size="sm" onClick={props.onSubmit} disabled={!isValid() || props.submitting} class="w-full">
        <Show when={props.submitting} fallback={<span>Send</span>}>
          <Spinner size="xs" class="border-white border-t-transparent" />
          <span>Sending...</span>
        </Show>
      </Button>
    </div>
  )
}

export function initFormValues(prompt: AgentPrompt): Record<string, unknown> {
  const schema = prompt.inputSchema as JSONSchema | undefined
  return extractDefaults(schema, schema?.required ?? [])
}
