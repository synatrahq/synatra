import { Show, For, createSignal, createEffect } from "solid-js"
import { Note, Pencil, Code } from "phosphor-solid-js"
import { FormField, Select, CodeEditor, SchemaTypeDisplay, Tooltip, TopLevelSchemaEditor } from "../../../../ui"
import { ScriptSignature } from "../../../../components"
import {
  validateTemplate,
  getAppPayloadSchema,
  generatePlaceholdersFromSchema,
  type ValidationStatus,
  type ValidationHighlight,
} from "../utils"
import { api } from "../../../../app"
import type { Prompts } from "../../../../app/api"

export type PromptMode = "prompt" | "template" | "script"
export type PromptVersionMode = "current" | "fixed"

type PromptReleaseItem = {
  id: string
  version: string
  createdAt: string
}

function InputSchemaPreview(props: { schema: Record<string, unknown> }) {
  const properties = () => (props.schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const required = () => (props.schema.required as string[]) ?? []
  const entries = () => Object.entries(properties())

  return (
    <Show when={entries().length > 0}>
      <div class="font-code text-2xs leading-relaxed text-text-muted">
        <For each={entries()}>
          {([key, propSchema]) => {
            const optional = () => !required().includes(key)
            const type = () => (propSchema.type as string) ?? "string"
            return (
              <div>
                <span class="text-text">{key}</span>
                <Show when={optional()}>
                  <span class="text-text-muted">?</span>
                </Show>
                <span class="text-text-muted">: {type()}</span>
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

function SchemaPropertyRow(props: { name: string; type: string; description?: string; depth: number }) {
  const content = (
    <span>
      <span style={{ color: "var(--syntax-property)" }}>{props.name}</span>
      <span style={{ color: "var(--syntax-punctuation)" }}>: </span>
      <span style={{ color: "var(--syntax-type)" }}>{props.type}</span>
    </span>
  )

  return (
    <div class="py-px" style={{ "padding-left": `${props.depth * 12}px` }}>
      <Show when={props.description} fallback={content}>
        <Tooltip content={props.description!} side="right">
          {content}
        </Tooltip>
      </Show>
    </div>
  )
}

function SchemaPropertiesTree(props: { schema: Record<string, unknown>; depth: number }) {
  const properties = () => (props.schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const entries = () => Object.entries(properties())

  return (
    <For each={entries()}>
      {([key, propSchema]) => {
        const type = () => (propSchema.type as string) ?? "string"
        const description = () => propSchema.description as string | undefined
        const hasNested = () => type() === "object" && propSchema.properties
        return (
          <>
            <SchemaPropertyRow name={key} type={type()} description={description()} depth={props.depth} />
            <Show when={hasNested()}>
              <SchemaPropertiesTree schema={propSchema} depth={props.depth + 1} />
            </Show>
          </>
        )
      }}
    </For>
  )
}

function NestedSchemaPreview(props: { schema: Record<string, unknown> }) {
  const properties = () => (props.schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const hasProperties = () => Object.keys(properties()).length > 0

  return (
    <Show when={hasProperties()}>
      <div class="font-code text-2xs">
        <SchemaPropertiesTree schema={props.schema} depth={0} />
      </div>
    </Show>
  )
}

function AppPayloadSchemaSection(props: { appId: string; events: string[] }) {
  const schema = () => getAppPayloadSchema(props.appId, props.events) ?? { type: "object", properties: {} }
  const placeholders = () => generatePlaceholdersFromSchema(schema())

  return (
    <div>
      <div class="mb-1 text-xs text-text-muted">Payload schema</div>
      <div class="rounded-md border border-border bg-surface px-3 py-2">
        <NestedSchemaPreview schema={schema()} />
      </div>
      <Show when={placeholders().length > 0}>
        <div class="mt-2">
          <div class="mb-1 text-2xs text-text-muted">Available placeholders</div>
          <div class="flex flex-wrap gap-1">
            {placeholders().map((placeholder) => (
              <Tooltip content="Click to copy">
                <button
                  type="button"
                  class="rounded bg-surface-muted px-1.5 py-0.5 font-code text-2xs text-text-muted transition-colors hover:bg-surface-muted/80 hover:text-text"
                  onClick={() => navigator.clipboard.writeText(placeholder)}
                >
                  {placeholder}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      </Show>
    </div>
  )
}

type PromptInspectorProps = {
  triggerType: "webhook" | "schedule" | "app"
  promptMode: PromptMode
  onPromptModeChange: (mode: PromptMode) => void
  prompts: Prompts
  selectedPromptId: string
  onPromptIdChange: (id: string) => void
  promptVersionMode: PromptVersionMode
  onPromptVersionModeChange: (mode: PromptVersionMode) => void
  promptReleases: PromptReleaseItem[]
  selectedPromptReleaseId: string | null
  onPromptReleaseIdChange: (id: string | null) => void
  promptContent: string
  onPromptContentChange: (content: string) => void
  script: string
  onScriptChange: (script: string) => void
  payloadSchema: Record<string, unknown>
  onPayloadSchemaChange: (schema: Record<string, unknown>) => void
  currentPromptInputSchema?: unknown
  input?: string
  onInputChange?: (input: string) => void
  inputPlaceholder?: string
  appId?: string | null
  appEvents?: string[]
}

export function PromptInspector(props: PromptInspectorProps) {
  const [validation, setValidation] = createSignal<{ status: ValidationStatus; message: string } | null>(null)
  const [highlights, setHighlights] = createSignal<ValidationHighlight[]>([])

  createEffect(() => {
    if (props.promptMode === "template" && props.triggerType !== "schedule") {
      const schema =
        props.triggerType === "app"
          ? (getAppPayloadSchema(props.appId, props.appEvents ?? []) ?? { type: "object", properties: {} })
          : props.payloadSchema
      const result = validateTemplate(props.promptContent, schema)
      setValidation(result.summary)
      setHighlights(result.highlights)
    } else {
      setValidation(null)
      setHighlights([])
    }
  })

  return (
    <div class="space-y-4 p-4">
      <div class="text-xs font-medium text-text">Prompt Configuration</div>
      <div class="space-y-3">
        <FormField horizontal labelWidth="5rem" label="Mode">
          <div class="flex gap-1.5">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
              classList={{
                "border-accent bg-accent/5 text-text": props.promptMode === "template",
                "border-border text-text-muted hover:border-border-strong": props.promptMode !== "template",
              }}
              onClick={() => props.onPromptModeChange("template")}
            >
              <Pencil class="h-3 w-3" />
              Template
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
              classList={{
                "border-accent bg-accent/5 text-text": props.promptMode === "script",
                "border-border text-text-muted hover:border-border-strong": props.promptMode !== "script",
              }}
              onClick={() => props.onPromptModeChange("script")}
            >
              <Code class="h-3 w-3" />
              Script
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
              classList={{
                "border-accent bg-accent/5 text-text": props.promptMode === "prompt",
                "border-border text-text-muted hover:border-border-strong": props.promptMode !== "prompt",
              }}
              onClick={() => props.onPromptModeChange("prompt")}
            >
              <Note class="h-3 w-3" />
              Prompt
            </button>
          </div>
        </FormField>

        <Show when={props.promptMode === "prompt"}>
          <FormField horizontal labelWidth="5rem" label="Prompt">
            <Select
              value={props.selectedPromptId}
              options={props.prompts.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              onChange={(value) => props.onPromptIdChange(value)}
              placeholder="Select prompt"
              class="h-7 text-xs"
            />
          </FormField>
          <Show when={props.selectedPromptId && props.promptReleases.length > 0}>
            <FormField horizontal labelWidth="5rem" label="Version">
              <Select
                value={props.promptVersionMode === "current" ? "latest" : (props.selectedPromptReleaseId ?? "")}
                options={[
                  { value: "latest", label: "Always use latest" },
                  ...props.promptReleases.map((r) => ({ value: r.id, label: r.version })),
                ]}
                onChange={(value) => {
                  if (value === "latest") {
                    props.onPromptVersionModeChange("current")
                    props.onPromptReleaseIdChange(null)
                  } else {
                    props.onPromptVersionModeChange("fixed")
                    props.onPromptReleaseIdChange(value)
                  }
                }}
                class="h-7 text-xs"
              />
            </FormField>
          </Show>
          <Show when={props.currentPromptInputSchema}>
            <Show
              when={props.triggerType === "schedule"}
              fallback={
                <FormField horizontal labelWidth="5rem" label="Input">
                  <div class="py-1 font-code text-xs">
                    <SchemaTypeDisplay schema={props.currentPromptInputSchema as Record<string, unknown>} />
                  </div>
                </FormField>
              }
            >
              <div>
                <div class="mb-1 text-xs text-text-muted">Input</div>
                <CodeEditor
                  value={props.input ?? ""}
                  onChange={(v) => props.onInputChange?.(v)}
                  language="json"
                  bordered
                  minLines={5}
                  indent={false}
                  placeholder={props.inputPlaceholder}
                />
                <div class="mt-2 rounded-md border border-border bg-surface px-3 py-2">
                  <div class="mb-1.5 text-2xs text-text-muted">Expected input schema</div>
                  <InputSchemaPreview schema={props.currentPromptInputSchema as Record<string, unknown>} />
                </div>
              </div>
            </Show>
          </Show>
        </Show>

        <Show when={props.promptMode === "template"}>
          <div class="space-y-4">
            <Show when={props.triggerType === "webhook"}>
              <div>
                <div class="mb-2 text-xs text-text-muted">Payload schema</div>
                <TopLevelSchemaEditor
                  schema={props.payloadSchema}
                  onChange={props.onPayloadSchemaChange}
                  availableRefs={[]}
                  rootTypePolicy="fixed"
                  fixedRootKind="object"
                />
                <Show when={Object.keys((props.payloadSchema.properties as Record<string, unknown>) ?? {}).length > 0}>
                  <div class="mt-2">
                    <div class="mb-1 text-2xs text-text-muted">Available placeholders</div>
                    <div class="flex flex-wrap gap-1">
                      {Object.keys((props.payloadSchema.properties as Record<string, unknown>) ?? {}).map((key) => {
                        const placeholder = `{{ ${key} }}`
                        return (
                          <Tooltip content="Click to copy">
                            <button
                              type="button"
                              class="rounded bg-surface-muted px-1.5 py-0.5 font-code text-2xs text-text-muted transition-colors hover:bg-surface-muted/80 hover:text-text"
                              onClick={() => navigator.clipboard.writeText(placeholder)}
                            >
                              {placeholder}
                            </button>
                          </Tooltip>
                        )
                      })}
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
            <Show when={props.triggerType === "app" && props.appId}>
              <AppPayloadSchemaSection appId={props.appId!} events={props.appEvents ?? []} />
            </Show>
            <div>
              <div class="mb-1 flex items-center justify-between">
                <span class="text-xs text-text-muted">Content</span>
                <Show when={props.triggerType !== "schedule" && validation()}>
                  {(v) => (
                    <span
                      class="text-2xs"
                      classList={{
                        "text-success": v().status === "success",
                        "text-warning": v().status === "missing-schema",
                        "text-danger": v().status === "error",
                      }}
                    >
                      {v().message}
                    </span>
                  )}
                </Show>
              </div>
              <CodeEditor
                value={props.promptContent}
                onChange={props.onPromptContentChange}
                language="markdown"
                bordered
                minLines={8}
                indent={false}
                placeholder="Enter prompt content. Use {{ variable }} for placeholders."
                highlights={props.triggerType !== "schedule" ? highlights() : []}
              />
            </div>
          </div>
        </Show>

        <Show when={props.promptMode === "script"}>
          <div class="space-y-4">
            <Show when={props.triggerType === "webhook"}>
              <div>
                <div class="mb-2 text-xs text-text-muted">Payload schema</div>
                <TopLevelSchemaEditor
                  schema={props.payloadSchema}
                  onChange={props.onPayloadSchemaChange}
                  availableRefs={[]}
                  rootTypePolicy="fixed"
                  fixedRootKind="object"
                />
              </div>
            </Show>
            <Show when={props.triggerType === "app" && props.appId}>
              <AppPayloadSchemaSection appId={props.appId!} events={props.appEvents ?? []} />
            </Show>
            <div>
              <div class="mb-2 text-xs text-text-muted">Script</div>
              <div class="rounded-md border border-border bg-surface">
                <ScriptSignature
                  paramName="payload"
                  paramSchema={props.payloadSchema}
                  fetchResources={async () => {
                    const res = await api.api.resources.$get()
                    if (!res.ok) return []
                    const data = await res.json()
                    return data.map((r) => ({ slug: r.slug, type: r.type }))
                  }}
                />
                <CodeEditor
                  value={props.script}
                  onChange={props.onScriptChange}
                  language="javascript"
                  bordered={false}
                  minLines={12}
                  indent
                  placeholder={`// Return { action: "skip" } to skip execution
// Return { action: "run", prompt: "..." } to run with prompt

return { action: "run", prompt: "Hello" }`}
                />
                <ScriptSignature paramName="payload" position="footer" />
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
