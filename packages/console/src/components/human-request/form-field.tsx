import { For } from "solid-js"
import { JSONSchemaField, extractDefaults, validateFieldValue, type JSONSchema } from "../../ui"
import type { HumanRequestFormConfig } from "@synatra/core/types"

export { extractDefaults, validateFieldValue }

type FormFieldProps = {
  config: HumanRequestFormConfig & { key: string }
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  touched: Record<string, boolean>
  onBlur: (name: string) => void
}

export function FormField(props: FormFieldProps) {
  const schema = () => props.config.schema as JSONSchema
  const properties = () => schema()?.properties ?? {}
  const required = () => schema()?.required ?? []

  const handleFieldChange = (name: string, value: unknown) => {
    props.onChange({ ...props.value, [name]: value })
  }

  const getError = (name: string, fieldSchema: JSONSchema) => {
    if (!props.touched[name]) return undefined
    return validateFieldValue(props.value[name], fieldSchema, required().includes(name)) ?? undefined
  }

  return (
    <div class="space-y-2">
      <For each={Object.entries(properties())}>
        {([name, fieldSchema]) => (
          <JSONSchemaField
            name={name}
            schema={fieldSchema as JSONSchema}
            required={required().includes(name)}
            value={props.value[name]}
            onChange={(val) => handleFieldChange(name, val)}
            onBlur={() => props.onBlur(name)}
            error={getError(name, fieldSchema as JSONSchema)}
          />
        )}
      </For>
    </div>
  )
}
