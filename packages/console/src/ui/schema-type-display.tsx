import { For, Show, Switch, Match, type JSX } from "solid-js"
import { parseRef } from "./schema-editor"

type Schema = Record<string, unknown>

function Punc(props: { children: string }) {
  return <span class="text-syntax-punctuation">{props.children}</span>
}

function Type(props: { children: string }) {
  return <span class="text-syntax-type">{props.children}</span>
}

function Prop(props: { children: string }) {
  return <span class="text-syntax-property">{props.children}</span>
}

function Str(props: { children: string | string[] }) {
  return <span class="text-syntax-string">{props.children}</span>
}

type SchemaTypeDisplayProps = {
  schema: Schema
}

export function SchemaTypeDisplay(props: SchemaTypeDisplayProps): JSX.Element {
  return <SchemaNode schema={props.schema} />
}

function getSchemaKind(
  schema: Schema,
): "invalid" | "ref" | "allOf" | "enum" | "string" | "number" | "boolean" | "array" | "object" {
  if (!schema || typeof schema !== "object") return "invalid"
  if (schema.$ref) return "ref"
  if (schema.allOf) return "allOf"
  if (schema.enum) return "enum"
  const type = schema.type as string | undefined
  if (type === "string") return "string"
  if (type === "number" || type === "integer") return "number"
  if (type === "boolean") return "boolean"
  if (type === "array") return "array"
  if (type === "object" || schema.properties) return "object"
  return "object"
}

function SchemaNode(props: { schema: Schema }): JSX.Element {
  const kind = () => getSchemaKind(props.schema)

  return (
    <Switch fallback={<Type>object</Type>}>
      <Match when={kind() === "invalid"}>
        <Type>object</Type>
      </Match>
      <Match when={kind() === "ref"}>
        <Type>{parseRef(props.schema.$ref as string) ?? "unknown"}</Type>
      </Match>
      <Match when={kind() === "allOf"}>
        <For each={props.schema.allOf as Schema[]}>
          {(part, index) => (
            <>
              <SchemaNode schema={part} />
              <Show when={index() < (props.schema.allOf as Schema[]).length - 1}>
                <Punc>{" & "}</Punc>
              </Show>
            </>
          )}
        </For>
      </Match>
      <Match when={kind() === "enum"}>
        <For each={props.schema.enum as string[]}>
          {(value, index) => (
            <>
              <Str>"{value}"</Str>
              <Show when={index() < (props.schema.enum as string[]).length - 1}>
                <Punc>{" | "}</Punc>
              </Show>
            </>
          )}
        </For>
      </Match>
      <Match when={kind() === "string"}>
        <Type>string</Type>
      </Match>
      <Match when={kind() === "number"}>
        <Type>number</Type>
      </Match>
      <Match when={kind() === "boolean"}>
        <Type>boolean</Type>
      </Match>
      <Match when={kind() === "array"}>
        <ArrayTypeDisplay schema={props.schema} />
      </Match>
      <Match when={kind() === "object"}>
        <ObjectTypeDisplay schema={props.schema} />
      </Match>
    </Switch>
  )
}

function ArrayTypeDisplay(props: { schema: Schema }): JSX.Element {
  const items = () => (props.schema.items as Schema) ?? {}
  const needsParens = () => {
    const i = items()
    return i.allOf || i.enum || (i.type === "object" && i.properties)
  }

  return (
    <>
      <Show when={needsParens()}>
        <Punc>(</Punc>
      </Show>
      <SchemaNode schema={items()} />
      <Show when={needsParens()}>
        <Punc>)</Punc>
      </Show>
      <Punc>[]</Punc>
    </>
  )
}

function ObjectTypeDisplay(props: { schema: Schema }): JSX.Element {
  const properties = () => props.schema.properties as Record<string, Schema> | undefined
  const required = () => (props.schema.required as string[]) ?? []
  const entries = () => Object.entries(properties() ?? {})
  const hasProperties = () => properties() && Object.keys(properties()!).length > 0

  return (
    <Show when={hasProperties()} fallback={<Type>object</Type>}>
      <Punc>{"{ "}</Punc>
      <For each={entries()}>
        {([key, propSchema], index) => {
          const optional = () => !required().includes(key)
          return (
            <>
              <Prop>{key}</Prop>
              <Show when={optional()}>
                <Punc>?</Punc>
              </Show>
              <Punc>: </Punc>
              <SchemaNode schema={propSchema} />
              <Show when={index() < entries().length - 1}>
                <Punc>; </Punc>
              </Show>
            </>
          )
        }}
      </For>
      <Punc>{" }"}</Punc>
    </Show>
  )
}
