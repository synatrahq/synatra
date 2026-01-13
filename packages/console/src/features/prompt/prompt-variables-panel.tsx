import { createSignal, createEffect } from "solid-js"
import { TopLevelSchemaEditor } from "../../ui"

type PromptVariablesPanelProps = {
  schema: unknown
  onChange: (schema: unknown) => void
}

function ensureObjectSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const s = schema as Record<string, unknown>
    if (s.type === "object" || s.properties) {
      return s
    }
  }
  return { type: "object", properties: {} }
}

export function PromptVariablesPanel(props: PromptVariablesPanelProps) {
  const [schema, setSchema] = createSignal<Record<string, unknown>>({ type: "object", properties: {} })

  createEffect(() => {
    setSchema(ensureObjectSchema(props.schema))
  })

  const handleChange = (newSchema: Record<string, unknown>) => {
    setSchema(newSchema)
    const properties = newSchema.properties as Record<string, unknown> | undefined
    if (!properties || Object.keys(properties).length === 0) {
      props.onChange(null)
      return
    }
    props.onChange(newSchema)
  }

  return (
    <div class="w-56">
      <div class="mb-2">
        <span class="text-2xs font-medium text-text-muted">Variables</span>
      </div>
      <TopLevelSchemaEditor
        schema={schema()}
        onChange={handleChange}
        availableRefs={[]}
        rootTypePolicy="fixed"
        fixedRootKind="object"
      />
    </div>
  )
}
