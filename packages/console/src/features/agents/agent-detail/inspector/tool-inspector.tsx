import { Show, For, createSignal, createEffect, onMount } from "solid-js"
import type { AgentTool } from "@synatra/core/types"
import { ManagedResourceType } from "@synatra/core/types"
import {
  Input,
  Select,
  CodeEditor,
  Checkbox,
  TopLevelSchemaEditor,
  SchemaTypeDisplay,
  FormField,
  CollapsibleSection,
} from "../../../../ui"
import { api } from "../../../../app"
import { approvalAuthorityOptions, approvalTimeoutOptions } from "./constants"

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
          { name: "method", type: '"GET" | "POST" | "PUT" | "PATCH" | "DELETE"' },
          { name: "path", type: "string" },
          {
            name: "options",
            type: "{ queryParams?: Record<string, string>, body?: unknown }",
            optional: true,
          },
        ],
        returnType: "Promise<unknown>",
      },
    ]
  }
  if (type === "github") {
    return [
      {
        name: "request",
        params: [
          { name: "method", type: '"GET" | "POST" | "PUT" | "PATCH" | "DELETE"' },
          { name: "endpoint", type: "string" },
          {
            name: "options",
            type: "{ queryParams?: Record<string, string>, body?: unknown }",
            optional: true,
          },
        ],
        returnType: "Promise<unknown>",
      },
    ]
  }
  if (type === "intercom") {
    return [
      {
        name: "request",
        params: [
          { name: "method", type: '"GET" | "POST" | "PUT" | "PATCH" | "DELETE"' },
          { name: "endpoint", type: "string" },
          {
            name: "options",
            type: "{ queryParams?: Record<string, string>, body?: unknown }",
            optional: true,
          },
        ],
        returnType: "Promise<unknown>",
      },
    ]
  }
  if (type === "restapi") {
    return [
      {
        name: "request",
        params: [
          { name: "method", type: '"GET" | "POST" | "PUT" | "PATCH" | "DELETE"' },
          { name: "path", type: "string" },
          {
            name: "options",
            type: "{ headers?: Record<string, string>, queryParams?: Record<string, string>, body?: unknown }",
            optional: true,
          },
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

function ContextTypeDisplay(props: { resources: ResourceInfo[] }) {
  const [showTooltip, setShowTooltip] = createSignal(false)
  const [tooltipPos, setTooltipPos] = createSignal({ top: 0, left: 0 })
  let ref: HTMLSpanElement | undefined

  const handleMouseEnter = () => {
    if (!ref) return
    const rect = ref.getBoundingClientRect()
    setTooltipPos({ top: rect.bottom + 4, left: rect.left })
    setShowTooltip(true)
  }

  return (
    <>
      <span
        ref={ref}
        class="border-b border-dotted border-current"
        style={{ color: "var(--syntax-type)" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
      >
        Context
      </span>
      <Show when={showTooltip()}>
        <div
          class="fixed z-50 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          style={{ top: `${tooltipPos().top}px`, left: `${tooltipPos().left}px` }}
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

export function ToolInspector(props: {
  tool: AgentTool
  index: number
  availableRefs: string[]
  existingNames: string[]
  onUpdate: (tool: AgentTool) => void
}) {
  const [resources, setResources] = createSignal<ResourceInfo[]>([])
  const [localName, setLocalName] = createSignal(props.tool.name)
  const [nameError, setNameError] = createSignal("")

  createEffect(() => {
    setLocalName(props.tool.name)
    setNameError("")
  })

  const otherNames = () => props.existingNames.filter((n) => n !== props.tool.name)

  const handleNameBlur = () => {
    const name = localName().trim()
    if (!name) {
      setNameError("Name is required")
      return
    }
    if (otherNames().includes(name)) {
      setNameError("This name already exists")
      return
    }
    setNameError("")
    if (name !== props.tool.name) {
      props.onUpdate({ ...props.tool, name })
    }
  }

  onMount(async () => {
    try {
      const res = await api.api.resources.$get()
      if (res.ok) {
        const data = await res.json()
        const filtered = data.filter(
          (r) => !ManagedResourceType.includes(r.type as (typeof ManagedResourceType)[number]),
        )
        setResources(filtered.map((r) => ({ slug: r.slug, type: r.type })))
      }
    } catch (e) {
      console.error("Failed to fetch resources", e)
    }
  })

  const hasParams = () => {
    const p = props.tool.params
    if (p.$ref || p.allOf) return true
    if (
      p.type === "array" ||
      p.type === "string" ||
      p.type === "number" ||
      p.type === "integer" ||
      p.type === "boolean"
    )
      return true
    if (p.properties && Object.keys(p.properties as object).length > 0) return true
    return false
  }

  const hasReturns = () => {
    const r = props.tool.returns
    if (r.$ref || r.allOf) return true
    if (
      r.type === "array" ||
      r.type === "string" ||
      r.type === "number" ||
      r.type === "integer" ||
      r.type === "boolean"
    )
      return true
    if (r.properties && Object.keys(r.properties as object).length > 0) return true
    return false
  }

  const updateField = <K extends keyof AgentTool>(key: K, value: AgentTool[K]) => {
    props.onUpdate({ ...props.tool, [key]: value })
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
              onBlur={handleNameBlur}
              hasError={!!nameError()}
              class="font-code text-xs"
              placeholder="toolName"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Description">
            <Input
              type="text"
              value={props.tool.description}
              onInput={(e) => updateField("description", e.currentTarget.value)}
              class="text-xs"
              placeholder="What this tool does"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Timeout (ms)">
            <Input
              type="number"
              min="100"
              max="60000"
              step="100"
              value={props.tool.timeoutMs ?? 30000}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                updateField("timeoutMs", isNaN(val) ? 30000 : val)
              }}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Review">
            <Checkbox
              checked={props.tool.requiresReview ?? false}
              onChange={(e) => updateField("requiresReview", e.currentTarget.checked || undefined)}
              label="Requires human approval"
              labelClass="text-xs text-text-muted"
            />
          </FormField>
          <Show when={props.tool.requiresReview}>
            <FormField horizontal labelWidth="6rem" label="Authority">
              <Select
                value={props.tool.approvalAuthority ?? "any_member"}
                options={approvalAuthorityOptions}
                onChange={(v) => updateField("approvalAuthority", v)}
              />
            </FormField>
            <FormField horizontal labelWidth="6rem" label="Self-approval">
              <Checkbox
                checked={props.tool.selfApproval ?? true}
                onChange={(e) => updateField("selfApproval", e.currentTarget.checked)}
                label="Allow thread creator to approve"
                labelClass="text-xs text-text-muted"
              />
            </FormField>
            <FormField horizontal labelWidth="6rem" label="Timeout">
              <Select
                value={props.tool.approvalTimeoutMs ?? 259200000}
                options={approvalTimeoutOptions}
                onChange={(v) => updateField("approvalTimeoutMs", v)}
              />
            </FormField>
          </Show>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <TopLevelSchemaEditor
          schema={props.tool.params}
          onChange={(schema) => updateField("params", schema)}
          availableRefs={props.availableRefs}
          rootTypePolicy="selectable"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Returns">
        <TopLevelSchemaEditor
          schema={props.tool.returns}
          onChange={(schema) => updateField("returns", schema)}
          availableRefs={props.availableRefs}
          rootTypePolicy="selectable"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Code">
        <div class="overflow-hidden rounded-md bg-surface-muted font-code text-xs">
          <div class="border-b border-border/50 px-3 py-2">
            <span class="text-syntax-keyword">async function</span>{" "}
            <span class="text-syntax-function">{props.tool.name || "tool"}</span>
            <span class="text-syntax-punctuation">(</span>
            <Show when={hasParams()}>
              <span class="text-syntax-variable">params</span>
              <span class="text-syntax-punctuation">: </span>
              <SchemaTypeDisplay schema={props.tool.params} />
              <span class="text-syntax-punctuation">, </span>
            </Show>
            <span class="text-syntax-variable">context</span>
            <span class="text-syntax-punctuation">: </span>
            <ContextTypeDisplay resources={resources()} />
            <span class="text-syntax-punctuation">): </span>
            <Show when={hasReturns()} fallback={<span class="text-syntax-type">void</span>}>
              <SchemaTypeDisplay schema={props.tool.returns} />
            </Show>
            <span class="text-syntax-punctuation">{" {"}</span>
          </div>
          <CodeEditor
            value={props.tool.code}
            onChange={(v) => updateField("code", v)}
            language="javascript"
            placeholder="// Your tool implementation"
          />
          <div class="border-t border-border/50 px-3 py-1.5">
            <span class="text-text-muted">{"}"}</span>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
