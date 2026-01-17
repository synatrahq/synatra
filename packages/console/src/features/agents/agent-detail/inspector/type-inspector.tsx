import { createSignal, createEffect } from "solid-js"
import type { TypeDef } from "@synatra/core/types"
import { ValidJsonSchemaTypes } from "@synatra/util/validate"
import { Input, TopLevelSchemaEditor, FormField, CollapsibleSection } from "../../../../ui"

export function TypeInspector(props: {
  name: string
  typeDef: TypeDef
  availableRefs: string[]
  onUpdate: (typeDef: TypeDef) => void
  onRename: (newName: string) => void
}) {
  const [localName, setLocalName] = createSignal(props.name)
  const [nameError, setNameError] = createSignal("")

  createEffect(() => {
    setLocalName(props.name)
    setNameError("")
  })

  const otherNames = () => props.availableRefs.filter((n) => n !== props.name)

  const handleBlur = () => {
    const newName = localName().trim()
    if (!newName) {
      setNameError("Name is required")
      return
    }
    if (otherNames().includes(newName)) {
      setNameError("This name already exists")
      return
    }
    setNameError("")
    if (newName !== props.name) {
      props.onRename(newName)
    }
  }

  const schemaFromTypeDef = (): Record<string, unknown> => ({
    ...(props.typeDef.type ? { type: props.typeDef.type } : {}),
    ...(props.typeDef.type === "object"
      ? {
          properties: props.typeDef.properties ?? {},
          ...(props.typeDef.required ? { required: props.typeDef.required } : {}),
        }
      : {}),
    ...(props.typeDef.type === "array" ? { items: props.typeDef.items } : {}),
  })

  const typeDefFromSchema = (schema: Record<string, unknown>): TypeDef => {
    const resolvedType =
      typeof schema.type === "string" && ValidJsonSchemaTypes.includes(schema.type as TypeDef["type"])
        ? (schema.type as TypeDef["type"])
        : "object"

    return {
      type: resolvedType,
      properties:
        resolvedType === "object"
          ? (schema.properties as Record<string, Record<string, unknown>> | undefined)
          : undefined,
      items: resolvedType === "array" ? (schema.items as Record<string, unknown> | undefined) : undefined,
      required: resolvedType === "object" ? (schema.required as string[] | undefined) : undefined,
    }
  }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Settings">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Name" error={nameError()}>
            <Input
              type="text"
              value={localName()}
              onInput={(e) => setLocalName(e.currentTarget.value)}
              onBlur={handleBlur}
              hasError={!!nameError()}
              class="font-code text-xs"
              placeholder="TypeName"
            />
          </FormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Schema">
        <TopLevelSchemaEditor
          schema={schemaFromTypeDef()}
          onChange={(schema) => props.onUpdate(typeDefFromSchema(schema))}
          availableRefs={props.availableRefs.filter((r) => r !== props.name)}
          rootTypePolicy="selectable"
        />
      </CollapsibleSection>
    </div>
  )
}
