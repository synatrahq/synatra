import { Show, For, Switch, Match, Index, createSignal } from "solid-js"
import { Button } from "./button"
import { IconButton } from "./icon-button"
import { Input } from "./input"
import { Label } from "./label"
import { Select } from "./select"
import { Checkbox } from "./checkbox"
import { DatePicker } from "./date-picker"
import { TimePicker } from "./time-picker"
import { DateTimePicker } from "./date-time-picker"
import { EmailInput } from "./email-input"
import { UriInput } from "./uri-input"
import { PasswordInput } from "./password-input"
import { UuidInput } from "./uuid-input"
import { Plus, X } from "phosphor-solid-js"

export type JSONSchema = {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  enum?: string[]
  oneOf?: JSONSchema[]
  const?: unknown
  items?: JSONSchema
  default?: unknown
  format?: string
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  minProperties?: number
  maxProperties?: number
  additionalProperties?: boolean | JSONSchema
}

function tryRegExp(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    try {
      new RegExp(pattern, "v")
      return true
    } catch {
      return false
    }
  }
}

export function sanitizePattern(pattern: string | undefined): string | undefined {
  if (!pattern) return undefined
  if (tryRegExp(pattern)) return pattern
  const fixed = pattern.replace(/\[([^\]]*[a-zA-Z0-9])-([a-zA-Z0-9][^\]]*)\]/g, (match, before, after) => {
    if (before.endsWith("\\")) return match
    return `[${before}\\-${after}]`
  })
  if (tryRegExp(fixed)) return fixed
  return undefined
}

export function safePatternTest(pattern: string | undefined, value: string): boolean {
  const normalized = sanitizePattern(pattern)
  if (!normalized) return true
  try {
    return new RegExp(normalized).test(value)
  } catch {
    return true
  }
}

function getOneOfOptions(schema: JSONSchema): Array<{ value: unknown; label: string }> | null {
  if (!schema.oneOf || schema.oneOf.length === 0) return null
  const options: Array<{ value: unknown; label: string }> = []
  for (const item of schema.oneOf) {
    if (item.const !== undefined) {
      options.push({ value: item.const, label: item.title ?? String(item.const) })
      continue
    }
    if (Array.isArray(item.enum) && item.enum.length > 0) {
      for (const value of item.enum) {
        options.push({ value, label: item.title ?? String(value) })
      }
    }
  }
  return options.length > 0 ? options : null
}

export function validateFieldValue(value: unknown, schema: JSONSchema, required: boolean): string | null {
  if (value === undefined || value === null) {
    return required ? "This field is required" : null
  }

  const isArrayField = schema.type === "array" || schema.items !== undefined
  if (isArrayField) {
    if (!Array.isArray(value)) {
      return "Invalid list"
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return `At least ${schema.minItems} items required`
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      return `Maximum ${schema.maxItems} items allowed`
    }
    if (schema.uniqueItems && value.length > 1) {
      const seen = new Set<string>()
      for (const item of value) {
        const key = JSON.stringify(item)
        if (seen.has(key)) return "Items must be unique"
        seen.add(key)
      }
    }
  }

  if (schema.enum && schema.enum.length > 0 && !schema.enum.includes(value as string)) {
    return "Must be one of the allowed values"
  }

  if (schema.const !== undefined && value !== schema.const) {
    return "Invalid value"
  }

  if (schema.oneOf && schema.oneOf.length > 0) {
    const matches = schema.oneOf.some((item) => validateFieldValue(value, item as JSONSchema, false) === null)
    if (!matches) return "Value does not match any allowed option"
  }

  if (typeof value === "string") {
    if (value.trim() === "") {
      return required ? "This field is required" : null
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return `Minimum ${schema.minLength} characters required`
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return `Maximum ${schema.maxLength} characters allowed`
    }
    if (schema.pattern && !safePatternTest(schema.pattern, value)) {
      return "Invalid format"
    }
    if (schema.format === "email") {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(value)) return "Invalid email address"
    }
    if (schema.format === "uri") {
      try {
        new URL(value)
      } catch {
        return "Invalid URL"
      }
    }
    if (schema.format === "uuid") {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidPattern.test(value)) return "Invalid UUID"
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      return `Must be at least ${schema.minimum}`
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return `Must be at most ${schema.maximum}`
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      return `Must be greater than ${schema.exclusiveMinimum}`
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      return `Must be less than ${schema.exclusiveMaximum}`
    }
    if (schema.multipleOf !== undefined && schema.multipleOf !== 0) {
      const remainder = Math.abs(value % schema.multipleOf)
      const tolerance = 1e-10
      if (remainder > tolerance && Math.abs(remainder - schema.multipleOf) > tolerance) {
        return `Must be a multiple of ${schema.multipleOf}`
      }
    }
  }

  if (typeof value === "object" && !Array.isArray(value) && value !== null) {
    if (schema.type && schema.type !== "object") return "Invalid value"
    const entries = value as Record<string, unknown>
    const count = Object.keys(entries).length
    if (schema.minProperties !== undefined && count < schema.minProperties) {
      return `At least ${schema.minProperties} properties required`
    }
    if (schema.maxProperties !== undefined && count > schema.maxProperties) {
      return `Maximum ${schema.maxProperties} properties allowed`
    }
    if (schema.required && schema.required.length > 0) {
      for (const key of schema.required) {
        if (entries[key] === undefined || entries[key] === null || entries[key] === "") {
          return `Missing required field: ${key}`
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const error = validateFieldValue(entries[key], propSchema, schema.required?.includes(key) ?? false)
        if (error) return error
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(entries)) {
        if (!schema.properties[key]) return "Additional properties not allowed"
      }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const [key, val] of Object.entries(entries)) {
        if (schema.properties && schema.properties[key]) continue
        const error = validateFieldValue(val, schema.additionalProperties, false)
        if (error) return error
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i += 1) {
      const error = validateFieldValue(value[i], schema.items, false)
      if (error) return `Item ${i + 1}: ${error}`
    }
  }

  return null
}

export function extractDefaults(schema: JSONSchema | undefined, required: string[] = []): Record<string, unknown> {
  if (!schema?.properties) return {}
  const defaults: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.default !== undefined) {
      defaults[key] = prop.default
    } else if ((prop.type === "number" || prop.type === "integer") && required.includes(key)) {
      defaults[key] = prop.minimum ?? 0
    } else if (prop.type === "object" && prop.properties) {
      const nested = extractDefaults(prop, prop.required ?? [])
      if (Object.keys(nested).length > 0) {
        defaults[key] = nested
      }
    }
  }
  return defaults
}

export function KeyValueEditor(props: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  onBlur?: () => void
  minProperties?: number
  maxProperties?: number
  valueSchema?: JSONSchema
  reservedKeys?: string[]
}) {
  const [newKey, setNewKey] = createSignal("")

  const entries = () => Object.entries(props.value).filter(([k]) => !props.reservedKeys?.includes(k))
  const totalCount = () => Object.keys(props.value).length
  const canAdd = () => props.maxProperties === undefined || totalCount() < props.maxProperties
  const canRemove = () => props.minProperties === undefined || totalCount() > props.minProperties
  const isReserved = (key: string) => props.reservedKeys?.includes(key) ?? false

  const getDefaultValue = (): unknown => {
    const s = props.valueSchema
    if (!s) return ""
    if (s.default !== undefined) return s.default
    if (s.enum && s.enum.length > 0) return s.enum[0]
    const type = s.type ?? (s.items ? "array" : "string")
    if (type === "boolean") return false
    if (type === "number" || type === "integer") return s.minimum ?? 0
    if (type === "array") return []
    if (type === "object") return extractDefaults(s, s.required ?? [])
    return ""
  }

  const constraint = () => {
    const min = props.minProperties
    const max = props.maxProperties
    if (min !== undefined && max !== undefined) return `${min}–${max}`
    if (min !== undefined) return `${min}+`
    if (max !== undefined) return `≤${max}`
    return null
  }

  const handleAdd = () => {
    const key = newKey().trim()
    if (!key || !canAdd() || isReserved(key)) return
    props.onChange({ ...props.value, [key]: getDefaultValue() })
    setNewKey("")
  }

  const handleRemove = (key: string) => {
    if (!canRemove()) return
    const updated = { ...props.value }
    delete updated[key]
    props.onChange(updated)
    props.onBlur?.()
  }

  const handleValueChange = (key: string, val: string) => {
    props.onChange({ ...props.value, [key]: val })
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  const schemaType = () => {
    const s = props.valueSchema
    if (!s) return "string"
    if (s.type) return s.type
    if (s.items) return "array"
    return "string"
  }

  const enumOptions = () => {
    const s = props.valueSchema
    if (!s?.enum || s.enum.length === 0) return null
    return s.enum.map((v) => ({ value: v, label: String(v) }))
  }

  const oneOfOptions = () => {
    const s = props.valueSchema
    if (!s) return null
    return getOneOfOptions(s)
  }

  const renderValueInput = (key: string, current: unknown) => {
    const s = props.valueSchema
    const options = oneOfOptions() ?? enumOptions()
    if (options) {
      return (
        <Select
          value={current as string}
          options={options}
          onChange={(v) => props.onChange({ ...props.value, [key]: v })}
        />
      )
    }

    if (!s) {
      return (
        <Input
          type="text"
          value={(current as string) ?? ""}
          onInput={(e) => handleValueChange(key, e.currentTarget.value)}
          class="flex-1 text-xs"
          placeholder="Value"
        />
      )
    }

    if (schemaType() === "boolean") {
      return (
        <Checkbox
          checked={(current as boolean) ?? false}
          onChange={(e) => props.onChange({ ...props.value, [key]: e.currentTarget.checked })}
        />
      )
    }

    if (schemaType() === "number" || schemaType() === "integer") {
      return (
        <Input
          type="number"
          value={(current as number) ?? ""}
          onInput={(e) => {
            const v = e.currentTarget.value
            props.onChange({ ...props.value, [key]: v === "" ? undefined : Number(v) })
          }}
          class="flex-1 text-xs"
          min={
            s.minimum ??
            (s.exclusiveMinimum !== undefined && schemaType() === "integer" ? s.exclusiveMinimum + 1 : undefined)
          }
          max={
            s.maximum ??
            (s.exclusiveMaximum !== undefined && schemaType() === "integer" ? s.exclusiveMaximum - 1 : undefined)
          }
          step={s.multipleOf}
        />
      )
    }

    if (schemaType() === "object" || schemaType() === "array") {
      const textValue =
        typeof current === "string" ? current : JSON.stringify(current ?? (schemaType() === "array" ? [] : {}))
      return (
        <Input
          type="text"
          value={textValue}
          onInput={(e) => {
            const v = e.currentTarget.value
            try {
              const parsed = JSON.parse(v)
              if (schemaType() === "array" ? Array.isArray(parsed) : typeof parsed === "object" && parsed !== null) {
                props.onChange({ ...props.value, [key]: parsed })
                return
              }
            } catch {
              props.onChange({ ...props.value, [key]: v })
              return
            }
            props.onChange({ ...props.value, [key]: v })
          }}
          class="flex-1 text-xs"
          placeholder="JSON value"
        />
      )
    }

    if (s.format === "email") {
      return (
        <EmailInput
          value={(current as string) ?? ""}
          onChange={(v) => props.onChange({ ...props.value, [key]: v })}
          minLength={s.minLength}
          maxLength={s.maxLength}
          pattern={sanitizePattern(s.pattern)}
        />
      )
    }
    if (s.format === "uri") {
      return (
        <UriInput
          value={(current as string) ?? ""}
          onChange={(v) => props.onChange({ ...props.value, [key]: v })}
          minLength={s.minLength}
          maxLength={s.maxLength}
          pattern={sanitizePattern(s.pattern)}
        />
      )
    }
    if (s.format === "password") {
      return (
        <PasswordInput
          value={(current as string) ?? ""}
          onChange={(v) => props.onChange({ ...props.value, [key]: v })}
          minLength={s.minLength}
          maxLength={s.maxLength}
          pattern={sanitizePattern(s.pattern)}
        />
      )
    }
    if (s.format === "uuid") {
      return (
        <UuidInput value={(current as string) ?? ""} onChange={(v) => props.onChange({ ...props.value, [key]: v })} />
      )
    }
    if (s.format === "date") {
      return (
        <DatePicker value={(current as string) ?? ""} onChange={(v) => props.onChange({ ...props.value, [key]: v })} />
      )
    }
    if (s.format === "date-time") {
      return (
        <DateTimePicker
          value={(current as string) ?? ""}
          onChange={(v) => props.onChange({ ...props.value, [key]: v })}
        />
      )
    }
    if (s.format === "time") {
      return (
        <TimePicker value={(current as string) ?? ""} onChange={(v) => props.onChange({ ...props.value, [key]: v })} />
      )
    }

    return (
      <Input
        type="text"
        value={(current as string) ?? ""}
        onInput={(e) => handleValueChange(key, e.currentTarget.value)}
        class="flex-1 text-xs"
        placeholder="Value"
        minLength={s.minLength}
        maxLength={s.maxLength}
        pattern={sanitizePattern(s.pattern)}
      />
    )
  }

  return (
    <div class="space-y-2">
      <Index each={entries()}>
        {(entry) => (
          <div class="flex items-center gap-2">
            <Input type="text" value={entry()[0]} readOnly class="flex-1 bg-surface-muted text-xs" />
            {renderValueInput(entry()[0], entry()[1])}
            <Button variant="ghost" size="sm" onClick={() => handleRemove(entry()[0])} disabled={!canRemove()}>
              <X class="h-3.5 w-3.5 text-text-muted" />
            </Button>
          </div>
        )}
      </Index>
      <div class="flex items-center gap-2">
        <Input
          type="text"
          value={newKey()}
          onInput={(e) => setNewKey(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          class="flex-1 text-xs"
          placeholder="Add new key..."
        />
        <Button variant="ghost" size="sm" onClick={handleAdd} disabled={!newKey().trim() || !canAdd()}>
          <Plus class="h-3.5 w-3.5" />
        </Button>
        <Show when={constraint()}>
          <span class="text-2xs text-text-muted">({constraint()})</span>
        </Show>
      </div>
    </div>
  )
}

export function ArrayField(props: {
  name: string
  itemSchema: JSONSchema
  value: unknown[]
  onChange: (value: unknown[]) => void
  onBlur?: () => void
  depth: number
  minItems?: number
  maxItems?: number
  compact?: boolean
}) {
  const itemRequired = () => props.itemSchema.required ?? []
  const canAdd = () => props.maxItems === undefined || props.value.length < props.maxItems
  const canRemove = () => props.minItems === undefined || props.value.length > props.minItems

  const handleAdd = () => {
    if (!canAdd()) return
    const newItem = (() => {
      if (props.itemSchema.default !== undefined) return props.itemSchema.default
      if (props.itemSchema.enum && props.itemSchema.enum.length > 0) return props.itemSchema.enum[0]
      const type = props.itemSchema.type ?? (props.itemSchema.items ? "array" : "string")
      if (type === "object") return extractDefaults(props.itemSchema, props.itemSchema.required ?? [])
      if (type === "array") return []
      if (type === "boolean") return false
      if (type === "number" || type === "integer") return props.itemSchema.minimum ?? 0
      return ""
    })()
    props.onChange([...props.value, newItem])
  }

  const handleRemove = (index: number) => {
    if (!canRemove()) return
    props.onChange(props.value.filter((_, i) => i !== index))
    props.onBlur?.()
  }

  const handleItemChange = (index: number, val: unknown) => {
    const updated = [...props.value]
    updated[index] = val
    props.onChange(updated)
  }

  const handleNestedChange = (index: number, key: string, val: unknown) => {
    const updated = [...props.value]
    updated[index] = { ...(updated[index] as Record<string, unknown>), [key]: val }
    props.onChange(updated)
  }

  return (
    <div class={props.compact ? "space-y-1.5" : "space-y-2"}>
      <Index each={props.value}>
        {(item, index) => (
          <div class={`rounded-lg border border-border ${props.compact ? "p-2 space-y-1.5" : "p-2.5 space-y-2"}`}>
            <div class="flex items-center justify-between">
              <span class="text-2xs text-text-muted font-medium">Item {index + 1}</span>
              <IconButton variant="ghost" size="xs" onClick={() => handleRemove(index)} disabled={!canRemove()}>
                <X class="h-3 w-3" />
              </IconButton>
            </div>
            <Show
              when={props.itemSchema.type === "object" && props.itemSchema.properties}
              fallback={
                <JSONSchemaField
                  name={`${props.name}[${index}]`}
                  schema={props.itemSchema}
                  required={false}
                  value={item()}
                  onChange={(val) => handleItemChange(index, val)}
                  onBlur={props.onBlur}
                  depth={props.depth + 1}
                  compact={props.compact}
                />
              }
            >
              <div class={props.compact ? "space-y-1.5" : "space-y-2"}>
                <For each={Object.entries(props.itemSchema.properties!)}>
                  {([key, schema]) => (
                    <JSONSchemaField
                      name={key}
                      schema={schema}
                      required={itemRequired().includes(key)}
                      value={(item() as Record<string, unknown>)[key]}
                      onChange={(val) => handleNestedChange(index, key, val)}
                      onBlur={props.onBlur}
                      depth={props.depth + 1}
                      compact={props.compact}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Index>
      <Button variant="outline" size="sm" onClick={handleAdd} class="w-full h-7 text-xs" disabled={!canAdd()}>
        <Plus class="h-3.5 w-3.5 mr-1" />
        Add {props.name.slice(0, -1) || "item"}
      </Button>
    </div>
  )
}

export function JSONSchemaField(props: {
  name: string
  schema: JSONSchema
  required: boolean
  value: unknown
  onChange: (value: unknown) => void
  onBlur?: () => void
  error?: string
  depth?: number
  compact?: boolean
}) {
  const hasError = () => !!props.error
  const fieldType = () => props.schema.type ?? (props.schema.items ? "array" : "string")
  const label = () => props.schema.title ?? props.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  const depth = () => props.depth ?? 0
  const compact = () => props.compact ?? false
  const objectValue = () => (props.value as Record<string, unknown>) ?? {}
  const arrayValue = () => (props.value as unknown[]) ?? []
  const nestedRequired = () => props.schema.required ?? []
  const stringFormat = () => (fieldType() === "string" ? (props.schema.format ?? "") : "")
  const hasAdditionalProperties = () =>
    fieldType() === "object" &&
    props.schema.additionalProperties !== undefined &&
    props.schema.additionalProperties !== false

  const arrayConstraint = () => {
    if (fieldType() !== "array") return null
    const min = props.schema.minItems
    const max = props.schema.maxItems
    if (min !== undefined && max !== undefined) return `${min}–${max}`
    if (min !== undefined) return `${min}+`
    if (max !== undefined) return `≤${max}`
    return null
  }

  const oneOfOptions = () => getOneOfOptions(props.schema)
  const hasComplexOneOf = () => props.schema.oneOf && props.schema.oneOf.length > 0 && !oneOfOptions()

  const handleNestedChange = (key: string, val: unknown) => {
    props.onChange({ ...objectValue(), [key]: val })
  }

  return (
    <div class={compact() ? "space-y-0.5" : "space-y-1"}>
      <Show when={fieldType() !== "boolean"}>
        <Show
          when={compact()}
          fallback={
            <div class="flex items-center gap-1.5">
              <Label>
                {label()}
                <Show when={props.required}>
                  <span class="text-danger ml-0.5">*</span>
                </Show>
              </Label>
              <Show when={arrayConstraint()}>
                <span class="text-2xs text-text-muted">({arrayConstraint()})</span>
              </Show>
            </div>
          }
        >
          <div class="flex items-center gap-1">
            <span class="text-2xs text-text-muted">
              {label()}
              <Show when={props.required}>
                <span class="text-danger ml-0.5">*</span>
              </Show>
            </span>
            <Show when={arrayConstraint()}>
              <span class="text-2xs text-text-muted">({arrayConstraint()})</span>
            </Show>
          </div>
        </Show>
      </Show>

      <Show when={oneOfOptions()}>
        {(options) => (
          <Select
            value={props.value as string}
            options={options()}
            onChange={(v) => props.onChange(v)}
            placeholder={`Select ${label().toLowerCase()}...`}
            hasError={hasError()}
          />
        )}
      </Show>

      <Show when={hasComplexOneOf()}>
        <Input
          type="text"
          value={typeof props.value === "string" ? props.value : JSON.stringify(props.value ?? "")}
          onInput={(e) => {
            const v = e.currentTarget.value
            try {
              props.onChange(JSON.parse(v))
            } catch {
              props.onChange(v)
            }
          }}
          onBlur={props.onBlur}
          hasError={hasError()}
          placeholder="Enter JSON value..."
        />
      </Show>

      <Show when={!oneOfOptions() && !hasComplexOneOf() && props.schema.enum && props.schema.enum.length > 0}>
        <Select
          value={props.value as string}
          options={props.schema.enum!.map((v) => ({ value: v, label: v }))}
          onChange={(v) => props.onChange(v)}
          placeholder={`Select ${label().toLowerCase()}...`}
          hasError={hasError()}
        />
      </Show>

      <Show when={!oneOfOptions() && !hasComplexOneOf() && !props.schema.enum && fieldType() === "string"}>
        <Switch>
          <Match when={stringFormat() === "date"}>
            <DatePicker
              value={(props.value as string) ?? ""}
              onChange={(v) => props.onChange(v)}
              onBlur={props.onBlur}
              hasError={hasError()}
            />
          </Match>
          <Match when={stringFormat() === "date-time"}>
            <DateTimePicker
              value={(props.value as string) ?? ""}
              onChange={(v) => props.onChange(v)}
              onBlur={props.onBlur}
              hasError={hasError()}
            />
          </Match>
          <Match when={stringFormat() === "time"}>
            <TimePicker
              value={(props.value as string) ?? ""}
              onChange={(v) => props.onChange(v)}
              onBlur={props.onBlur}
              hasError={hasError()}
            />
          </Match>
          <Match when={stringFormat() === "email"}>
            <EmailInput
              value={(props.value as string) ?? ""}
              onChange={(v) => props.onChange(v)}
              onBlur={props.onBlur}
              hasError={hasError()}
              minLength={props.schema.minLength}
              maxLength={props.schema.maxLength}
              pattern={sanitizePattern(props.schema.pattern)}
            />
          </Match>
          <Match when={stringFormat() === "uri"}>
            <UriInput
              value={(props.value as string) ?? ""}
              onChange={(v) => props.onChange(v)}
              onBlur={props.onBlur}
              hasError={hasError()}
              minLength={props.schema.minLength}
              maxLength={props.schema.maxLength}
              pattern={sanitizePattern(props.schema.pattern)}
            />
          </Match>
          <Match when={stringFormat() === "password"}>
            <PasswordInput
              value={(props.value as string) ?? ""}
              onChange={(v) => props.onChange(v)}
              onBlur={props.onBlur}
              hasError={hasError()}
              minLength={props.schema.minLength}
              maxLength={props.schema.maxLength}
              pattern={sanitizePattern(props.schema.pattern)}
            />
          </Match>
          <Match when={stringFormat() === "uuid"}>
            <UuidInput
              value={(props.value as string) ?? ""}
              onChange={(v) => props.onChange(v)}
              onBlur={props.onBlur}
              hasError={hasError()}
            />
          </Match>
          <Match when={true}>
            <Input
              type="text"
              value={(props.value as string) ?? ""}
              onInput={(e) => props.onChange(e.currentTarget.value)}
              onBlur={props.onBlur}
              hasError={hasError()}
              minLength={props.schema.minLength}
              maxLength={props.schema.maxLength}
              pattern={sanitizePattern(props.schema.pattern)}
            />
          </Match>
        </Switch>
      </Show>

      <Show when={fieldType() === "number" || fieldType() === "integer"}>
        <Input
          type="number"
          value={(props.value as number) ?? ""}
          onInput={(e) => {
            const v = e.currentTarget.value
            props.onChange(v === "" ? undefined : Number(v))
          }}
          onBlur={props.onBlur}
          hasError={hasError()}
          min={
            props.schema.minimum ??
            (props.schema.exclusiveMinimum !== undefined && fieldType() === "integer"
              ? props.schema.exclusiveMinimum + 1
              : undefined)
          }
          max={
            props.schema.maximum ??
            (props.schema.exclusiveMaximum !== undefined && fieldType() === "integer"
              ? props.schema.exclusiveMaximum - 1
              : undefined)
          }
          step={props.schema.multipleOf}
        />
      </Show>

      <Show when={fieldType() === "boolean"}>
        <Checkbox
          checked={(props.value as boolean) ?? false}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
          hasError={hasError()}
          label={
            <>
              {label()}
              <Show when={props.required}>
                <span class="text-danger ml-0.5">*</span>
              </Show>
            </>
          }
        />
        <Show when={props.schema.description}>
          <p class={compact() ? "text-[9px] text-text-muted opacity-70" : "text-2xs text-text-muted opacity-70"}>
            {props.schema.description}
          </p>
        </Show>
      </Show>

      <Show when={fieldType() === "object" && props.schema.properties}>
        <div
          class={
            depth() > 0
              ? `pl-3 border-l border-border ${compact() ? "space-y-1" : "space-y-2"}`
              : compact()
                ? "space-y-1"
                : "space-y-2"
          }
        >
          <For each={Object.entries(props.schema.properties!)}>
            {([key, schema]) => (
              <JSONSchemaField
                name={key}
                schema={schema}
                required={nestedRequired().includes(key)}
                value={objectValue()[key]}
                onChange={(val) => handleNestedChange(key, val)}
                onBlur={props.onBlur}
                depth={depth() + 1}
                compact={compact()}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={fieldType() === "array" && props.schema.items}>
        <ArrayField
          name={props.name}
          itemSchema={props.schema.items!}
          value={arrayValue()}
          onChange={(val) => props.onChange(val)}
          onBlur={props.onBlur}
          depth={depth()}
          minItems={props.schema.minItems}
          maxItems={props.schema.maxItems}
          compact={compact()}
        />
      </Show>

      <Show when={hasAdditionalProperties()}>
        <div
          class={
            props.schema.properties
              ? compact()
                ? "mt-1 pt-1 border-t border-border"
                : "mt-2 pt-2 border-t border-border"
              : ""
          }
        >
          <Show when={props.schema.properties}>
            <p
              class={
                compact() ? "text-[9px] text-text-muted opacity-70 mb-1" : "text-2xs text-text-muted opacity-70 mb-2"
              }
            >
              Additional fields
            </p>
          </Show>
          <KeyValueEditor
            value={(props.value as Record<string, unknown>) ?? {}}
            onChange={(val) => props.onChange(val)}
            onBlur={props.onBlur}
            minProperties={props.schema.minProperties}
            maxProperties={props.schema.maxProperties}
            valueSchema={
              typeof props.schema.additionalProperties === "object" ? props.schema.additionalProperties : undefined
            }
            reservedKeys={props.schema.properties ? Object.keys(props.schema.properties) : undefined}
          />
        </div>
      </Show>

      <Show when={props.error}>
        <p class={compact() ? "text-[9px] text-danger" : "text-2xs text-danger"}>{props.error}</p>
      </Show>

      <Show when={!props.error && props.schema.description && fieldType() !== "boolean"}>
        <p class={compact() ? "text-[9px] text-text-muted opacity-70" : "text-2xs text-text-muted opacity-70"}>
          {props.schema.description}
        </p>
      </Show>
    </div>
  )
}
