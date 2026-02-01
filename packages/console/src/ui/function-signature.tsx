import { Show } from "solid-js"
import type { JSX } from "solid-js"
import { SchemaTypeDisplay } from "./schema-type-display"
import type { JSONSchema } from "./json-schema-field"

export interface FunctionSignatureProps {
  name: string
  hasParams?: boolean
  paramSchema?: JSONSchema
  returnSchema?: JSONSchema
  contextType?: JSX.Element
  wrapReturnInPromise?: boolean
  defaultParamType?: string
  defaultReturnType?: string
}

export function FunctionSignature(props: FunctionSignatureProps) {
  const hasParamSchema = () => props.paramSchema && Object.keys(props.paramSchema).length > 0
  const hasReturnSchema = () => props.returnSchema && Object.keys(props.returnSchema).length > 0
  const defaultParamType = () => props.defaultParamType ?? "unknown"
  const defaultReturnType = () => props.defaultReturnType ?? "void"

  return (
    <span>
      <span class="text-syntax-keyword">async function</span> <span class="text-syntax-function">{props.name}</span>
      <span class="text-syntax-punctuation">(</span>
      <Show when={props.hasParams}>
        <span class="text-syntax-variable">params</span>
        <span class="text-syntax-punctuation">: </span>
        <Show when={hasParamSchema()} fallback={<span class="text-syntax-type">{defaultParamType()}</span>}>
          <SchemaTypeDisplay schema={props.paramSchema!} />
        </Show>
        <span class="text-syntax-punctuation">, </span>
      </Show>
      <span class="text-syntax-variable">context</span>
      <Show when={props.contextType}>
        <span class="text-syntax-punctuation">: </span>
        {props.contextType}
      </Show>
      <span class="text-syntax-punctuation">): </span>
      <Show when={props.wrapReturnInPromise}>
        <span class="text-syntax-type">Promise&lt;</span>
      </Show>
      <Show when={hasReturnSchema()} fallback={<span class="text-syntax-type">{defaultReturnType()}</span>}>
        <SchemaTypeDisplay schema={props.returnSchema!} />
      </Show>
      <Show when={props.wrapReturnInPromise}>
        <span class="text-syntax-type">&gt;</span>
      </Show>
      <span class="text-syntax-punctuation">{" {"}</span>
    </span>
  )
}
