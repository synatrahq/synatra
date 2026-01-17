import { Show, Index, For, createSignal, createEffect, onMount, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import { CaretDown, Plus, X } from "phosphor-solid-js"
import { Input } from "./input"
import { Select, type SelectOption } from "./select"
import { Checkbox } from "./checkbox"

export function parseRef(ref: string): string | null {
  const match = ref.match(/^#\/\$defs\/(.+)$/)
  return match ? match[1] : null
}

const PRIMITIVE_TYPES = ["string", "number", "boolean"] as const
const COMPLEX_TYPES = ["object", "array", "$ref", "allOf"] as const
const ALL_TYPES = [...PRIMITIVE_TYPES, ...COMPLEX_TYPES] as const
type SchemaKind = (typeof ALL_TYPES)[number]

function getSchemaKind(schema: Record<string, unknown>): SchemaKind {
  if (!schema || typeof schema !== "object") return "object"
  if ("$ref" in schema) return "$ref"
  if ("allOf" in schema) return "allOf"
  const type = schema.type as string | undefined
  if (type === "array") return "array"
  if (type === "object" || schema.properties) return "object"
  if (type === "number" || type === "integer") return "number"
  if (type === "boolean") return "boolean"
  if (type === "string") return "string"
  return "object"
}

function kindToSchema(kind: SchemaKind): Record<string, unknown> {
  switch (kind) {
    case "string":
    case "number":
    case "boolean":
      return { type: kind }
    case "object":
      return { type: "object", properties: {} }
    case "array":
      return { type: "array", items: { type: "string" } }
    case "$ref":
      return { $ref: "" }
    case "allOf":
      return { allOf: [{ type: "object", properties: {} }] }
  }
}

function schemaSummary(schema: Record<string, unknown>, kind: SchemaKind): string {
  if (kind === "$ref") {
    const ref = parseRef(schema.$ref as string)
    return ref || "(select)"
  }
  if (kind === "object") {
    const props = schema.properties as Record<string, unknown> | undefined
    const count = props ? Object.keys(props).length : 0
    if (count === 0) return "{}"
    return count === 1 ? "{} 1 key" : `{} ${count} keys`
  }
  if (kind === "array") {
    const items = schema.items as Record<string, unknown> | undefined
    if (!items) return "[]"
    const itemKind = getSchemaKind(items)
    return `${schemaSummary(items, itemKind)}[]`
  }
  if (kind === "allOf") {
    const schemas = schema.allOf as Record<string, unknown>[] | undefined
    const count = schemas?.length ?? 0
    if (count === 0) return "allOf()"
    return `allOf(${count})`
  }
  return kind
}

type LabelKind = "property" | "keyword" | "index" | "root"

type EditSchemaPopoverProps = {
  open: boolean
  position: { top: number; left: number }
  label: string
  labelKind: LabelKind
  schema: Record<string, unknown>
  required: boolean
  availableRefs: string[]
  onNameChange?: (name: string) => void
  onSchemaChange: (schema: Record<string, unknown>) => void
  onRequiredChange?: (required: boolean) => void
  onClose: () => void
  canEditType?: boolean
}

function EditSchemaPopover(props: EditSchemaPopoverProps) {
  let popoverRef: HTMLDivElement | undefined
  const [name, setName] = createSignal(props.label)

  createEffect(() => {
    if (props.open) {
      setName(props.label)
    }
  })

  const handleClickOutside = (e: MouseEvent) => {
    if (!props.open || !popoverRef) return
    const target = e.target as HTMLElement
    if (popoverRef.contains(target)) return
    if (target.closest("[data-select-menu]")) return
    props.onClose()
  }

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside)
  })

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside)
  })

  const canEditName = () => props.labelKind === "property"
  const canEditRequired = () => props.labelKind === "property"

  const kind = () => getSchemaKind(props.schema)
  const ref = () => (props.schema.$ref ? (parseRef(props.schema.$ref as string) ?? "") : "")
  const description = () => (props.schema.description as string) ?? ""

  const typeOptions = (): SelectOption<string>[] => {
    const options: SelectOption<string>[] = [
      ...PRIMITIVE_TYPES.map((t) => ({ value: t, label: t })),
      { value: "object", label: "object" },
      { value: "array", label: "array" },
      { value: "allOf", label: "allOf" },
      ...props.availableRefs.map((r) => ({ value: `$ref:${r}`, label: r, badge: "$ref" })),
    ]
    return options
  }

  const selectedType = () => (kind() === "$ref" ? `$ref:${ref()}` : kind())

  const handleTypeChange = (value: string) => {
    let newKind: SchemaKind
    let newRef = ""
    if (value.startsWith("$ref:")) {
      newKind = "$ref"
      newRef = value.slice(5)
    } else {
      newKind = value as SchemaKind
    }

    let schema: Record<string, unknown>
    if (newKind === "$ref" && newRef) {
      schema = { $ref: `#/$defs/${newRef}` }
    } else {
      schema = { ...kindToSchema(newKind) }
    }
    if (description()) {
      schema.description = description()
    }
    if (newKind === "object" && props.schema.properties) {
      schema.properties = props.schema.properties
      if (props.schema.required) schema.required = props.schema.required
    }
    if (newKind === "array" && props.schema.items) {
      schema.items = props.schema.items
    }
    if (newKind === "allOf" && props.schema.allOf) {
      schema.allOf = props.schema.allOf
    }
    props.onSchemaChange(schema)
  }

  const handleDescriptionChange = (value: string) => {
    const updated = { ...props.schema }
    if (value) {
      updated.description = value
    } else {
      delete updated.description
    }
    props.onSchemaChange(updated)
  }

  const handleNameBlur = () => {
    const value = name().trim()
    if (value && value !== props.label) {
      props.onNameChange?.(value)
    }
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div
          ref={popoverRef}
          class="fixed z-50 w-80 rounded-lg border border-border bg-surface-floating p-3 shadow-elevated"
          style={{ top: `${props.position.top}px`, left: `${props.position.left}px` }}
        >
          <div class="flex flex-col gap-2.5">
            <Show when={canEditName()}>
              <div class="flex items-center gap-2">
                <label class="w-16 shrink-0 text-xs text-text-muted">Name</label>
                <Input
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNameBlur()
                  }}
                  class="h-7 flex-1 font-code text-xs"
                />
              </div>
            </Show>

            <Show when={props.canEditType ?? true}>
              <div class="flex items-center gap-2">
                <label class="w-16 shrink-0 text-xs text-text-muted">Type</label>
                <Select
                  value={selectedType()}
                  options={typeOptions()}
                  onChange={handleTypeChange}
                  wrapperClass="relative flex min-w-0 flex-1"
                  class="h-7 font-code text-xs"
                />
              </div>
            </Show>

            <div class="flex items-center gap-2">
              <label class="w-16 shrink-0 text-xs text-text-muted">Description</label>
              <Input
                type="text"
                value={description()}
                onBlur={(e) => handleDescriptionChange(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleDescriptionChange(e.currentTarget.value)
                }}
                placeholder="Optional"
                class="h-7 flex-1 text-xs"
              />
            </div>

            <Show when={canEditRequired()}>
              <div class="flex items-center gap-2">
                <div class="w-16 shrink-0" />
                <Checkbox
                  checked={props.required}
                  onChange={(e) => props.onRequiredChange?.(e.currentTarget.checked)}
                  label="Required"
                />
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  )
}

type SchemaRowProps = {
  label: string
  labelKind?: LabelKind
  schema: Record<string, unknown>
  required?: boolean
  depth: number
  availableRefs: string[]
  expanded: boolean
  onToggle: () => void
  onLabelChange?: (label: string) => void
  onSchemaChange: (schema: Record<string, unknown>) => void
  onRequiredChange?: (required: boolean) => void
  onRemove?: () => void
}

function getLabelColor(kind: LabelKind): string {
  switch (kind) {
    case "keyword":
      return "var(--syntax-keyword)"
    case "index":
      return "var(--syntax-number)"
    case "property":
    default:
      return "var(--syntax-property)"
  }
}

function SchemaRow(props: SchemaRowProps) {
  const [popoverOpen, setPopoverOpen] = createSignal(false)
  const [popoverPos, setPopoverPos] = createSignal({ top: 0, left: 0 })
  let triggerRef: HTMLButtonElement | undefined

  const kind = () => getSchemaKind(props.schema)
  const hasChildren = () => kind() === "object" || kind() === "array" || kind() === "allOf"
  const summary = () => schemaSummary(props.schema, kind())
  const description = () => (props.schema.description as string) ?? ""

  const padding = () => `${props.depth * 12}px`
  const labelColor = () => getLabelColor(props.labelKind ?? "property")

  const openPopover = () => {
    if (!triggerRef) return
    const rect = triggerRef.getBoundingClientRect()
    setPopoverPos({ top: rect.bottom + 4, left: rect.left })
    setPopoverOpen(true)
  }

  return (
    <>
      <div
        class="group flex h-6 items-center gap-1 rounded px-1 text-code transition-colors hover:bg-surface-muted"
        style={{ "padding-left": padding() }}
      >
        <Show when={hasChildren()} fallback={<span class="w-4 shrink-0" />}>
          <button
            type="button"
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-text"
            onClick={props.onToggle}
          >
            <span class="flex h-3 w-3 transition-transform duration-150" classList={{ "-rotate-90": !props.expanded }}>
              <CaretDown class="h-3 w-3" />
            </span>
          </button>
        </Show>

        <button
          ref={triggerRef}
          type="button"
          class="shrink-0 truncate font-code transition-colors hover:text-accent hover:underline"
          style={{ color: labelColor() }}
          onClick={openPopover}
        >
          {props.label}
        </button>

        <Show when={props.required === false}>
          <span class="font-code" style={{ color: "var(--syntax-punctuation)" }}>
            ?
          </span>
        </Show>

        <span class="font-code" style={{ color: "var(--syntax-punctuation)" }}>
          :
        </span>

        <button
          type="button"
          class="min-w-0 shrink-0 truncate font-code transition-colors hover:text-accent"
          style={{ color: hasChildren() ? "var(--syntax-comment)" : "var(--syntax-type)" }}
          onClick={openPopover}
        >
          {summary()}
        </button>

        <Show when={description()}>
          <span class="min-w-0 flex-1 truncate text-2xs text-text-muted" title={description()}>
            {description()}
          </span>
        </Show>

        <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Show when={props.onRemove}>
            <button
              type="button"
              class="flex h-4 w-4 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-danger"
              onClick={props.onRemove}
            >
              <X class="h-3 w-3" />
            </button>
          </Show>
        </div>
      </div>

      <EditSchemaPopover
        open={popoverOpen()}
        position={popoverPos()}
        label={props.label}
        labelKind={props.labelKind ?? "property"}
        schema={props.schema}
        required={props.required ?? false}
        availableRefs={props.availableRefs}
        onNameChange={props.onLabelChange}
        onSchemaChange={props.onSchemaChange}
        onRequiredChange={props.onRequiredChange}
        onClose={() => setPopoverOpen(false)}
      />
    </>
  )
}

type ObjectEditorProps = {
  schema: Record<string, unknown>
  onChange: (schema: Record<string, unknown>) => void
  availableRefs: string[]
  depth: number
  expanded: string[]
  onToggle: (path: string) => void
  pathPrefix: string
}

function ObjectEditor(props: ObjectEditorProps) {
  const properties = () => (props.schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const required = () => (props.schema.required as string[]) ?? []
  const entries = () => Object.entries(properties())

  const update = (newProps: Record<string, Record<string, unknown>>, newRequired?: string[]) => {
    const result: Record<string, unknown> = { type: "object", properties: newProps }
    const req = (newRequired ?? required()).filter((k) => k in newProps)
    if (req.length > 0) result.required = req
    props.onChange(result)
  }

  const addProperty = () => {
    const current = properties()
    let idx = 1
    let name = `field${idx}`
    while (name in current) {
      idx++
      name = `field${idx}`
    }
    update({ ...current, [name]: { type: "string" } })
  }

  const renameProperty = (oldName: string, newName: string) => {
    if (oldName === newName || !newName.trim()) return
    const current = properties()
    if (newName in current) return
    const newProps: Record<string, Record<string, unknown>> = {}
    for (const [k, v] of Object.entries(current)) {
      newProps[k === oldName ? newName : k] = v
    }
    const newReq = required().map((r) => (r === oldName ? newName : r))
    update(newProps, newReq)
  }

  const updateProperty = (name: string, schema: Record<string, unknown>) => {
    update({ ...properties(), [name]: schema })
  }

  const toggleRequired = (name: string) => {
    const req = required()
    const newReq = req.includes(name) ? req.filter((r) => r !== name) : [...req, name]
    update(properties(), newReq)
  }

  const removeProperty = (name: string) => {
    const { [name]: _, ...rest } = properties()
    update(rest)
  }

  return (
    <>
      <Index each={entries()}>
        {(entry) => {
          const name = () => entry()[0]
          const schema = () => entry()[1]
          const path = () => `${props.pathPrefix}.${name()}`
          const isExpanded = () => props.expanded.includes(path())
          const kind = () => getSchemaKind(schema())
          const hasChildren = () => kind() === "object" || kind() === "array" || kind() === "allOf"

          return (
            <>
              <SchemaRow
                label={name()}
                schema={schema()}
                required={required().includes(name())}
                depth={props.depth}
                availableRefs={props.availableRefs}
                expanded={isExpanded()}
                onToggle={() => props.onToggle(path())}
                onLabelChange={(n) => renameProperty(name(), n)}
                onSchemaChange={(s) => updateProperty(name(), s)}
                onRequiredChange={() => toggleRequired(name())}
                onRemove={() => removeProperty(name())}
              />
              <Show when={isExpanded() && hasChildren()}>
                <NestedEditor
                  schema={schema()}
                  onChange={(s) => updateProperty(name(), s)}
                  availableRefs={props.availableRefs}
                  depth={props.depth + 1}
                  expanded={props.expanded}
                  onToggle={props.onToggle}
                  pathPrefix={path()}
                />
              </Show>
            </>
          )
        }}
      </Index>
      <button
        type="button"
        class="flex h-6 items-center gap-1 rounded px-1 text-code text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        style={{ "padding-left": `${props.depth * 12}px` }}
        onClick={addProperty}
      >
        <Plus class="h-3 w-3" />
        <span>property</span>
      </button>
    </>
  )
}

type ArrayEditorProps = {
  schema: Record<string, unknown>
  onChange: (schema: Record<string, unknown>) => void
  availableRefs: string[]
  depth: number
  expanded: string[]
  onToggle: (path: string) => void
  pathPrefix: string
}

function ArrayEditor(props: ArrayEditorProps) {
  const items = () => (props.schema.items as Record<string, unknown>) ?? { type: "string" }
  const path = () => `${props.pathPrefix}.items`
  const isExpanded = () => props.expanded.includes(path())
  const kind = () => getSchemaKind(items())
  const hasChildren = () => kind() === "object" || kind() === "array" || kind() === "allOf"

  const updateItems = (schema: Record<string, unknown>) => {
    props.onChange({ type: "array", items: schema })
  }

  return (
    <>
      <SchemaRow
        label="items"
        labelKind="keyword"
        schema={items()}
        depth={props.depth}
        availableRefs={props.availableRefs}
        expanded={isExpanded()}
        onToggle={() => props.onToggle(path())}
        onSchemaChange={updateItems}
      />
      <Show when={isExpanded() && hasChildren()}>
        <NestedEditor
          schema={items()}
          onChange={updateItems}
          availableRefs={props.availableRefs}
          depth={props.depth + 1}
          expanded={props.expanded}
          onToggle={props.onToggle}
          pathPrefix={path()}
        />
      </Show>
    </>
  )
}

type AllOfEditorProps = {
  schema: Record<string, unknown>
  onChange: (schema: Record<string, unknown>) => void
  availableRefs: string[]
  depth: number
  expanded: string[]
  onToggle: (path: string) => void
  pathPrefix: string
}

function AllOfEditor(props: AllOfEditorProps) {
  const schemas = () => (props.schema.allOf as Record<string, unknown>[]) ?? []

  const update = (newSchemas: Record<string, unknown>[]) => {
    props.onChange({ allOf: newSchemas })
  }

  const addSchema = () => {
    update([...schemas(), { type: "object", properties: {} }])
  }

  const updateSchema = (index: number, schema: Record<string, unknown>) => {
    const updated = [...schemas()]
    updated[index] = schema
    update(updated)
  }

  const removeSchema = (index: number) => {
    update(schemas().filter((_, i) => i !== index))
  }

  return (
    <>
      <Index each={schemas()}>
        {(schema, index) => {
          const path = () => `${props.pathPrefix}[${index}]`
          const isExpanded = () => props.expanded.includes(path())
          const kind = () => getSchemaKind(schema())
          const hasChildren = () => kind() === "object" || kind() === "array" || kind() === "allOf"

          return (
            <>
              <SchemaRow
                label={`[${index}]`}
                labelKind="index"
                schema={schema()}
                depth={props.depth}
                availableRefs={props.availableRefs}
                expanded={isExpanded()}
                onToggle={() => props.onToggle(path())}
                onSchemaChange={(s) => updateSchema(index, s)}
                onRemove={() => removeSchema(index)}
              />
              <Show when={isExpanded() && hasChildren()}>
                <NestedEditor
                  schema={schema()}
                  onChange={(s) => updateSchema(index, s)}
                  availableRefs={props.availableRefs}
                  depth={props.depth + 1}
                  expanded={props.expanded}
                  onToggle={props.onToggle}
                  pathPrefix={path()}
                />
              </Show>
            </>
          )
        }}
      </Index>
      <button
        type="button"
        class="flex h-6 items-center gap-1 rounded px-1 text-code text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        style={{ "padding-left": `${props.depth * 12}px` }}
        onClick={addSchema}
      >
        <Plus class="h-3 w-3" />
        <span>schema</span>
      </button>
    </>
  )
}

type NestedEditorProps = {
  schema: Record<string, unknown>
  onChange: (schema: Record<string, unknown>) => void
  availableRefs: string[]
  depth: number
  expanded: string[]
  onToggle: (path: string) => void
  pathPrefix: string
}

function NestedEditor(props: NestedEditorProps) {
  const kind = () => getSchemaKind(props.schema)

  return (
    <>
      <Show when={kind() === "object"}>
        <ObjectEditor
          schema={props.schema}
          onChange={props.onChange}
          availableRefs={props.availableRefs}
          depth={props.depth}
          expanded={props.expanded}
          onToggle={props.onToggle}
          pathPrefix={props.pathPrefix}
        />
      </Show>
      <Show when={kind() === "array"}>
        <ArrayEditor
          schema={props.schema}
          onChange={props.onChange}
          availableRefs={props.availableRefs}
          depth={props.depth}
          expanded={props.expanded}
          onToggle={props.onToggle}
          pathPrefix={props.pathPrefix}
        />
      </Show>
      <Show when={kind() === "allOf"}>
        <AllOfEditor
          schema={props.schema}
          onChange={props.onChange}
          availableRefs={props.availableRefs}
          depth={props.depth}
          expanded={props.expanded}
          onToggle={props.onToggle}
          pathPrefix={props.pathPrefix}
        />
      </Show>
    </>
  )
}

type SchemaEditorProps = {
  schema: Record<string, unknown>
  onChange: (schema: Record<string, unknown>) => void
  availableRefs: string[]
  label?: string
  depth?: number
  rootTypePolicy?: "fixed" | "selectable"
  fixedRootKind?: SchemaKind
}

export function SchemaEditor(props: SchemaEditorProps) {
  const [expanded, setExpanded] = createSignal<string[]>(["$"])
  const [popoverOpen, setPopoverOpen] = createSignal(false)
  const [popoverPos, setPopoverPos] = createSignal({ top: 0, left: 0 })
  let triggerRef: HTMLButtonElement | undefined
  const rootPath = "$"

  const effectiveRootKind = () =>
    props.rootTypePolicy === "fixed" ? (props.fixedRootKind ?? "object") : getSchemaKind(props.schema)
  const normalizeRoot = (schema: Record<string, unknown>): Record<string, unknown> => {
    if (props.rootTypePolicy !== "fixed") return schema
    const target = effectiveRootKind()
    if (target === "object") {
      const properties = (schema.properties as Record<string, unknown>) ?? {}
      const required = (schema.required as string[]) ?? []
      return { type: "object", properties, ...(required.length > 0 ? { required } : {}) }
    }
    if (target === "array") {
      const items = (schema.items as Record<string, unknown>) ?? { type: "string" }
      return { type: "array", items }
    }
    if (target === "$ref") {
      const ref = parseRef(schema.$ref as string) ?? ""
      return ref ? { $ref: `#/$defs/${ref}` } : { $ref: "" }
    }
    if (target === "allOf") {
      const allOf = (schema.allOf as Record<string, unknown>[]) ?? []
      return { allOf }
    }
    return { type: target }
  }

  createEffect(() => {
    if (props.rootTypePolicy !== "fixed") return
    if (getSchemaKind(props.schema) !== effectiveRootKind()) {
      props.onChange(normalizeRoot(props.schema))
    }
  })

  const handleRootChange = (schema: Record<string, unknown>) => {
    const updated = normalizeRoot(schema)
    props.onChange(updated)
  }

  const kind = () => effectiveRootKind()
  const hasChildren = () => kind() === "object" || kind() === "array" || kind() === "allOf"
  const isExpanded = () => expanded().includes(rootPath)

  const toggle = (path: string) => {
    setExpanded((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path)
      return [...prev, path]
    })
  }

  const openPopover = () => {
    if (!triggerRef) return
    const rect = triggerRef.getBoundingClientRect()
    setPopoverPos({ top: rect.bottom + 4, left: rect.left })
    setPopoverOpen(true)
  }

  return (
    <div class="rounded border border-border bg-surface">
      <div class="group flex h-7 items-center gap-1 rounded-t border-b border-border bg-surface-muted/50 px-2 text-code">
        <Show when={hasChildren()} fallback={<span class="w-4 shrink-0" />}>
          <button
            type="button"
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-text"
            onClick={() => toggle(rootPath)}
          >
            <span class="flex h-3 w-3 transition-transform duration-150" classList={{ "-rotate-90": !isExpanded() }}>
              <CaretDown class="h-3 w-3" />
            </span>
          </button>
        </Show>

        <button
          ref={triggerRef}
          type="button"
          class="truncate font-code transition-colors hover:text-accent hover:underline"
          style={{ color: hasChildren() ? "var(--syntax-comment)" : "var(--syntax-type)" }}
          onClick={openPopover}
        >
          {schemaSummary(props.schema, kind())}
        </button>
      </div>

      <Show when={isExpanded() && hasChildren()}>
        <div class="py-1">
          <NestedEditor
            schema={props.schema}
            onChange={handleRootChange}
            availableRefs={props.availableRefs}
            depth={1}
            expanded={expanded()}
            onToggle={toggle}
            pathPrefix={rootPath}
          />
        </div>
      </Show>

      <EditSchemaPopover
        open={popoverOpen()}
        position={popoverPos()}
        label=""
        labelKind="root"
        schema={props.schema}
        required={false}
        availableRefs={props.availableRefs}
        onSchemaChange={handleRootChange}
        canEditType={props.rootTypePolicy !== "fixed"}
        onClose={() => setPopoverOpen(false)}
      />
    </div>
  )
}

type TopLevelSchemaEditorProps = {
  schema: Record<string, unknown>
  onChange: (schema: Record<string, unknown>) => void
  availableRefs: string[]
  rootTypePolicy?: "fixed" | "selectable"
  fixedRootKind?: SchemaKind
}

export function TopLevelSchemaEditor(props: TopLevelSchemaEditorProps) {
  return (
    <SchemaEditor
      schema={props.schema}
      onChange={props.onChange}
      availableRefs={props.availableRefs}
      rootTypePolicy={props.rootTypePolicy}
      fixedRootKind={props.fixedRootKind}
    />
  )
}
