import { Show, For, createSignal, createMemo, createEffect } from "solid-js"
import { Button, CodeEditor, Spinner, Badge, JSONSchemaField, extractDefaults, type JSONSchema } from "../../../../ui"
import { Play, CaretRight, CaretDown, Copy, Check, Code, Sliders } from "phosphor-solid-js"
import { api } from "../../../../app"
import type { ToolTesterProps, ToolTestResult } from "./types"

type InputMode = "form" | "json"

export function ToolTester(props: ToolTesterProps) {
  const [selectedToolName, setSelectedToolName] = createSignal<string | null>(null)
  const [inputMode, setInputMode] = createSignal<InputMode>("form")
  const [jsonParams, setJsonParams] = createSignal("{}")
  const [formData, setFormData] = createSignal<Record<string, unknown>>({})
  const [executing, setExecuting] = createSignal(false)
  const [result, setResult] = createSignal<ToolTestResult | null>(null)
  const [expandedRequest, setExpandedRequest] = createSignal(false)
  const [expandedLogs, setExpandedLogs] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [jsonError, setJsonError] = createSignal<string | null>(null)

  const tools = createMemo(() => props.runtimeConfig?.tools ?? [])

  const selectedTool = createMemo(() => tools().find((t) => t.name === selectedToolName()))

  const paramsSchema = createMemo((): JSONSchema | null => {
    const tool = selectedTool()
    if (!tool) return null
    return tool.params as JSONSchema
  })

  const hasFormSchema = createMemo(() => {
    const schema = paramsSchema()
    if (!schema) return false
    if (schema.type === "object" && schema.properties && Object.keys(schema.properties).length > 0) {
      return true
    }
    return false
  })

  createEffect(() => {
    const list = tools()
    if (list.length > 0 && !selectedToolName()) {
      setSelectedToolName(list[0].name)
    }
  })

  createEffect(() => {
    const tool = selectedTool()
    if (!tool) return
    const schema = paramsSchema()
    const defaults = schema ? extractDefaults(schema, schema.required ?? []) : {}
    setFormData(defaults)
    setJsonParams(JSON.stringify(defaults, null, 2))
    setResult(null)
    setJsonError(null)
    setInputMode(hasFormSchema() ? "form" : "json")
  })

  const validateJson = (value: string): boolean => {
    try {
      JSON.parse(value)
      setJsonError(null)
      return true
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON")
      return false
    }
  }

  const handleJsonChange = (value: string) => {
    setJsonParams(value)
    validateJson(value)
  }

  const handleFormChange = (name: string, value: unknown) => {
    const updated = { ...formData(), [name]: value }
    setFormData(updated)
    setJsonParams(JSON.stringify(updated, null, 2))
    setJsonError(null)
  }

  const getParams = (): Record<string, unknown> | null => {
    if (inputMode() === "form") {
      return formData()
    }
    try {
      return JSON.parse(jsonParams())
    } catch {
      return null
    }
  }

  const canExecute = createMemo(() => {
    if (!selectedTool()) return false
    if (executing()) return false
    if (!props.environmentId) return false
    if (!props.runtimeConfig) return false
    if (inputMode() === "json" && jsonError()) return false
    return true
  })

  const handleExecute = async () => {
    const tool = selectedTool()
    if (!tool || !props.environmentId || !props.runtimeConfig) return

    const params = getParams()
    if (!params) return

    setExecuting(true)
    setResult(null)

    try {
      const res = await api.api.agents[":id"].playground["execute-tool"].$post({
        param: { id: props.agentId },
        json: {
          toolName: tool.name,
          params,
          environmentId: props.environmentId,
          runtimeConfig: props.runtimeConfig,
        },
      })

      if (!res.ok) {
        setResult({
          ok: false,
          error: "Request failed",
          logs: [],
          durationMs: 0,
        })
        return
      }

      const data = (await res.json()) as ToolTestResult
      setResult(data)
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
        logs: [],
        durationMs: 0,
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleCopy = async () => {
    const r = result()
    if (!r) return
    const text = r.ok ? JSON.stringify(r.result, null, 2) : (r.error ?? "")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatLogs = (logs: unknown[][]): string => {
    return logs.map((line) => line.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ")).join("\n")
  }

  return (
    <Show
      when={tools().length > 0}
      fallback={
        <div class="flex h-full flex-col items-center justify-center text-center">
          <p class="text-[10px] text-text-muted mb-0.5">No tools defined</p>
          <p class="text-[9px] text-text-muted/70 max-w-[180px]">Add tools to your agent configuration to test them</p>
        </div>
      }
    >
      <div class="flex h-full">
        <div class="w-48 shrink-0 flex flex-col border-r border-border bg-surface-elevated">
          <div class="flex-1 overflow-y-auto scrollbar-thin py-1">
            <For each={tools()}>
              {(tool) => (
                <button
                  type="button"
                  class="group flex w-full items-center gap-2 px-2.5 py-1 text-xs transition-colors"
                  classList={{
                    "bg-surface-muted text-text": selectedToolName() === tool.name,
                    "text-text-muted hover:bg-surface-muted hover:text-text": selectedToolName() !== tool.name,
                  }}
                  onClick={() => setSelectedToolName(tool.name)}
                >
                  <Code class="h-3 w-3 shrink-0 text-success" weight="duotone" />
                  <span class="truncate font-code text-2xs">{tool.name}</span>
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="flex flex-1 min-w-0 overflow-hidden">
          <Show when={selectedTool()}>
            <div class="flex flex-1 min-w-0 flex-col border-r border-border overflow-hidden">
              <div class="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
                <Show when={hasFormSchema()}>
                  <div class="flex items-center gap-0.5">
                    <button
                      type="button"
                      class="flex items-center gap-1 px-1 py-0.5 rounded text-2xs transition-colors"
                      classList={{
                        "bg-accent/10 text-accent": inputMode() === "form",
                        "text-text-muted hover:text-text": inputMode() !== "form",
                      }}
                      onClick={() => setInputMode("form")}
                    >
                      <Sliders class="h-2.5 w-2.5" />
                      Form
                    </button>
                    <button
                      type="button"
                      class="flex items-center gap-1 px-1 py-0.5 rounded text-2xs transition-colors"
                      classList={{
                        "bg-accent/10 text-accent": inputMode() === "json",
                        "text-text-muted hover:text-text": inputMode() !== "json",
                      }}
                      onClick={() => setInputMode("json")}
                    >
                      <Code class="h-2.5 w-2.5" />
                      JSON
                    </button>
                  </div>
                </Show>

                <div class="flex flex-col flex-1 min-h-0">
                  <label class="text-2xs text-text-muted mb-0.5 block shrink-0">Parameters</label>
                  <Show
                    when={inputMode() === "form" && hasFormSchema()}
                    fallback={
                      <div class="flex-1 min-h-0">
                        <CodeEditor
                          value={jsonParams()}
                          onChange={handleJsonChange}
                          language="json"
                          bordered
                          indent={false}
                        />
                        <Show when={jsonError()}>
                          <p class="text-2xs text-danger mt-0.5">{jsonError()}</p>
                        </Show>
                      </div>
                    }
                  >
                    <div class="flex-1 min-h-0 rounded border border-border bg-surface p-1.5 overflow-y-auto scrollbar-thin">
                      <div class="space-y-1.5">
                        <For each={Object.entries(paramsSchema()?.properties ?? {})}>
                          {([name, schema]) => (
                            <JSONSchemaField
                              name={name}
                              schema={schema}
                              required={paramsSchema()?.required?.includes(name) ?? false}
                              value={formData()[name]}
                              onChange={(val) => handleFormChange(name, val)}
                              compact
                            />
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>

              <div class="shrink-0 border-t border-border p-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleExecute}
                  disabled={!canExecute()}
                  class="w-full h-6 text-2xs"
                >
                  <Show
                    when={executing()}
                    fallback={
                      <>
                        <Play class="h-2.5 w-2.5 mr-1" weight="fill" /> Execute
                      </>
                    }
                  >
                    <Spinner size="xs" class="mr-1" /> Running...
                  </Show>
                </Button>
              </div>
            </div>

            <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
              <Show
                when={result()}
                fallback={
                  <div class="flex flex-1 items-center justify-center text-center p-2">
                    <p class="text-2xs text-text-muted">Run the tool to see results</p>
                  </div>
                }
              >
                {(r) => (
                  <div class="flex-1 flex flex-col p-2 gap-1.5 min-h-0">
                    <div class="flex items-center gap-1.5 shrink-0">
                      <Badge variant={r().ok ? "success" : "destructive"} class="text-2xs">
                        {r().ok ? "Success" : "Error"}
                      </Badge>
                      <span class="text-2xs text-text-muted">{r().durationMs}ms</span>
                      <div class="flex-1" />
                      <button
                        type="button"
                        class="rounded p-0.5 text-text-muted hover:text-text transition-colors"
                        onClick={handleCopy}
                        title="Copy result"
                      >
                        <Show when={copied()} fallback={<Copy class="h-3 w-3" />}>
                          <Check class="h-3 w-3 text-success" />
                        </Show>
                      </button>
                    </div>

                    <div class="flex-1 min-h-0 rounded border border-border bg-surface overflow-hidden flex flex-col">
                      <div class="border-b border-border px-1.5 py-0.5 shrink-0">
                        <span class="text-2xs text-text-muted">{r().ok ? "Result" : "Error"}</span>
                      </div>
                      <div class="p-1.5 flex-1 overflow-y-auto scrollbar-thin">
                        <pre class="font-code text-2xs text-text whitespace-pre-wrap">
                          {r().ok ? JSON.stringify(r().result, null, 2) : r().error}
                        </pre>
                      </div>
                    </div>

                    <Show when={r().logs.length > 0}>
                      <div class="shrink-0 rounded border border-border bg-surface overflow-hidden">
                        <button
                          type="button"
                          class="w-full flex items-center gap-1 px-1.5 py-0.5 text-left hover:bg-surface-muted transition-colors"
                          onClick={() => setExpandedLogs(!expandedLogs())}
                        >
                          {expandedLogs() ? <CaretDown class="h-2.5 w-2.5" /> : <CaretRight class="h-2.5 w-2.5" />}
                          <span class="text-2xs text-text-muted">Logs ({r().logs.length})</span>
                        </button>
                        <Show when={expandedLogs()}>
                          <div class="border-t border-border p-1.5 max-h-20 overflow-y-auto scrollbar-thin">
                            <pre class="font-code text-2xs text-text-muted whitespace-pre-wrap">
                              {formatLogs(r().logs)}
                            </pre>
                          </div>
                        </Show>
                      </div>
                    </Show>

                    <div class="shrink-0 rounded border border-border bg-surface overflow-hidden">
                      <button
                        type="button"
                        class="w-full flex items-center gap-1 px-1.5 py-0.5 text-left hover:bg-surface-muted transition-colors"
                        onClick={() => setExpandedRequest(!expandedRequest())}
                      >
                        {expandedRequest() ? <CaretDown class="h-2.5 w-2.5" /> : <CaretRight class="h-2.5 w-2.5" />}
                        <span class="text-2xs text-text-muted">Request</span>
                      </button>
                      <Show when={expandedRequest()}>
                        <div class="border-t border-border p-1.5 max-h-20 overflow-y-auto scrollbar-thin">
                          <pre class="font-code text-2xs text-text-muted whitespace-pre-wrap">
                            {JSON.stringify({ tool: selectedTool()?.name, params: getParams() }, null, 2)}
                          </pre>
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}
