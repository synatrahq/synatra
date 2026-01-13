import { Show, For, createSignal, onMount } from "solid-js"
import { SchemaTypeDisplay } from "../ui/schema-type-display"

type Schema = Record<string, unknown>

type ResourceInfo = {
  slug: string
  type: string
}

type MethodParam = { name: string; type: string; optional?: boolean }
type MethodDef = { name: string; params: MethodParam[]; returnType: string }

function getResourceMethods(type: string): MethodDef[] {
  if (type === "postgres" || type === "mysql") {
    return [
      {
        name: "query",
        params: [
          { name: "sql", type: "string" },
          { name: "params", type: "unknown[]", optional: true },
        ],
        returnType: "Promise<unknown[]>",
      },
    ]
  }
  if (type === "stripe") {
    return [
      {
        name: "request",
        params: [
          { name: "method", type: "string" },
          { name: "path", type: "string" },
          { name: "body", type: "object", optional: true },
        ],
        returnType: "Promise<unknown>",
      },
    ]
  }
  if (type === "github" || type === "intercom") {
    return [
      {
        name: "request",
        params: [
          { name: "method", type: "string" },
          { name: "endpoint", type: "string" },
          { name: "body", type: "object", optional: true },
        ],
        returnType: "Promise<unknown>",
      },
    ]
  }
  return []
}

function MethodSignature(props: { method: MethodDef }) {
  return (
    <span class="font-code text-[10px]">
      <span style={{ color: "var(--syntax-function)" }}>{props.method.name}</span>
      <span style={{ color: "var(--syntax-punctuation)" }}>(</span>
      <For each={props.method.params}>
        {(param, i) => (
          <>
            <span style={{ color: "var(--syntax-variable)" }}>{param.name}</span>
            <Show when={param.optional}>
              <span style={{ color: "var(--syntax-punctuation)" }}>?</span>
            </Show>
            <span style={{ color: "var(--syntax-punctuation)" }}>: </span>
            <span style={{ color: "var(--syntax-type)" }}>{param.type}</span>
            <Show when={i() < props.method.params.length - 1}>
              <span style={{ color: "var(--syntax-punctuation)" }}>, </span>
            </Show>
          </>
        )}
      </For>
      <span style={{ color: "var(--syntax-punctuation)" }}>): </span>
      <span style={{ color: "var(--syntax-type)" }}>{props.method.returnType}</span>
    </span>
  )
}

function ResultTypeDisplay() {
  const [show, setShow] = createSignal(false)
  const [pos, setPos] = createSignal({ top: 0, left: 0 })
  let ref: HTMLSpanElement | undefined

  const handleEnter = () => {
    if (!ref) return
    const rect = ref.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
    setShow(true)
  }

  return (
    <>
      <span
        ref={ref}
        class="cursor-help border-b border-dotted border-current"
        style={{ color: "var(--syntax-type)" }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        Result
      </span>
      <Show when={show()}>
        <div
          class="fixed z-50 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          style={{ top: `${pos().top}px`, left: `${pos().left}px` }}
        >
          <div class="p-2 font-code text-[10px]">
            <div class="flex flex-col">
              <div>
                <span style={{ color: "var(--syntax-punctuation)" }}>{"{ "}</span>
                <span style={{ color: "var(--syntax-property)" }}>action</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>: </span>
                <span style={{ color: "var(--syntax-string)" }}>"skip"</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>, </span>
                <span style={{ color: "var(--syntax-property)" }}>reason</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>?: </span>
                <span style={{ color: "var(--syntax-type)" }}>string</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>{" }"}</span>
              </div>
              <div>
                <span style={{ color: "var(--syntax-punctuation)" }}>| {"{ "}</span>
                <span style={{ color: "var(--syntax-property)" }}>action</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>: </span>
                <span style={{ color: "var(--syntax-string)" }}>"run"</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>, </span>
                <span style={{ color: "var(--syntax-property)" }}>prompt</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>: </span>
                <span style={{ color: "var(--syntax-type)" }}>string</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>{" }"}</span>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}

function ContextTypeDisplay(props: { resources: ResourceInfo[] }) {
  const [show, setShow] = createSignal(false)
  const [pos, setPos] = createSignal({ top: 0, left: 0 })
  let ref: HTMLSpanElement | undefined

  const handleEnter = () => {
    if (!ref) return
    const rect = ref.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
    setShow(true)
  }

  return (
    <>
      <span
        ref={ref}
        class="cursor-help border-b border-dotted border-current"
        style={{ color: "var(--syntax-type)" }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        Context
      </span>
      <Show when={show()}>
        <div
          class="fixed z-50 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          style={{ top: `${pos().top}px`, left: `${pos().left}px` }}
        >
          <div class="p-2 font-code text-[10px]">
            <div class="flex flex-col">
              <span style={{ color: "var(--syntax-punctuation)" }}>{"{"}</span>
              <div class="pl-3">
                <span style={{ color: "var(--syntax-property)" }}>resources</span>
                <span style={{ color: "var(--syntax-punctuation)" }}>: </span>
                <Show
                  when={props.resources.length > 0}
                  fallback={<span style={{ color: "var(--syntax-punctuation)" }}>{"{}"}</span>}
                >
                  <span style={{ color: "var(--syntax-punctuation)" }}>{"{"}</span>
                  <For each={props.resources}>
                    {(r, i) => {
                      const methods = getResourceMethods(r.type)
                      return (
                        <div class="pl-3">
                          <span style={{ color: "var(--syntax-property)" }}>{r.slug}</span>
                          <span style={{ color: "var(--syntax-punctuation)" }}>: {"{"}</span>
                          <For each={methods}>
                            {(m, mi) => (
                              <div class="pl-3">
                                <MethodSignature method={m} />
                                <Show when={mi() < methods.length - 1}>
                                  <span style={{ color: "var(--syntax-punctuation)" }}>;</span>
                                </Show>
                              </div>
                            )}
                          </For>
                          <span style={{ color: "var(--syntax-punctuation)" }}>{"}"}</span>
                          <Show when={i() < props.resources.length - 1}>
                            <span style={{ color: "var(--syntax-punctuation)" }}>;</span>
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                  <span style={{ color: "var(--syntax-punctuation)" }}>{"}"}</span>
                </Show>
              </div>
              <span style={{ color: "var(--syntax-punctuation)" }}>{"}"}</span>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}

type ScriptSignatureProps = {
  paramName: "input" | "payload"
  paramSchema?: Schema
  position?: "header" | "footer"
  fetchResources?: () => Promise<ResourceInfo[]>
}

export function ScriptSignature(props: ScriptSignatureProps) {
  const [resources, setResources] = createSignal<ResourceInfo[]>([])

  onMount(async () => {
    if (props.fetchResources) {
      try {
        const data = await props.fetchResources()
        setResources(data)
      } catch (e) {
        console.error("Failed to fetch resources", e)
      }
    }
  })

  const hasParams = () => {
    const s = props.paramSchema
    if (!s) return false
    if (s.properties && Object.keys(s.properties as object).length > 0) return true
    return false
  }

  if (props.position === "footer") {
    return (
      <div class="border-t border-border/50 px-3 py-1.5">
        <span class="text-text-muted">{"}"}</span>
      </div>
    )
  }

  return (
    <div class="border-b border-border/50 px-3 py-2 font-code text-xs">
      <span class="text-syntax-keyword">async function</span> <span class="text-syntax-function">script</span>
      <span class="text-syntax-punctuation">(</span>
      <Show when={hasParams()}>
        <span class="text-syntax-variable">{props.paramName}</span>
        <span class="text-syntax-punctuation">: </span>
        <SchemaTypeDisplay schema={props.paramSchema!} />
        <span class="text-syntax-punctuation">, </span>
      </Show>
      <span class="text-syntax-variable">context</span>
      <span class="text-syntax-punctuation">: </span>
      <ContextTypeDisplay resources={resources()} />
      <span class="text-syntax-punctuation">): </span>
      <ResultTypeDisplay />
      <span class="text-syntax-punctuation">{" {"}</span>
    </div>
  )
}
