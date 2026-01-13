import { Show, For, createSignal, createEffect, onCleanup } from "solid-js"
import {
  Skeleton,
  SkeletonText,
  Spinner,
  CodeEditor,
  Modal,
  ModalContainer,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "../../ui"
import { EntityIcon, ScriptSignature } from "../../components"
import { Note, PencilSimple, Wrench, ArrowSquareOut, Check, Code } from "phosphor-solid-js"
import type { PromptMode } from "@synatra/core/types"
import { A, useBeforeLeave } from "@solidjs/router"
import { PromptVariablesPanel } from "./prompt-variables-panel"
import { VersionControl } from "./version-control"
import { DeployDropdown } from "./deploy-dropdown"
import type { Prompt, PromptReleases, PromptWorkingCopy } from "../../app/api"
import { normalizeInputSchema, serializeConfig } from "@synatra/util/normalize"
import { api } from "../../app"

type PromptDetailProps = {
  prompt: Prompt | null
  loading?: boolean
  releases?: PromptReleases
  workingCopy?: PromptWorkingCopy | null
  onDelete?: (id: string) => void
  onSaveWorkingCopy?: (
    id: string,
    data: { mode: PromptMode; content: string; script: string; inputSchema: unknown },
  ) => Promise<void>
  onDeploy?: (id: string, bump: "major" | "minor" | "patch", description: string) => Promise<void>
  onAdopt?: (promptId: string, releaseId: string) => Promise<void>
  onCheckout?: (promptId: string, releaseId: string) => Promise<void>
  onUpdatePrompt?: (id: string, data: { name?: string }) => Promise<void>
}

type SaveStatus = "idle" | "saving" | "saved" | "error"
type ValidationStatus = "success" | "error" | "missing-schema"

function LoadingState() {
  return (
    <div class="flex flex-1 flex-col">
      <div class="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton class="h-6 w-6 rounded-md" />
        <Skeleton class="h-4 w-32" />
      </div>
      <div class="flex-1 p-4">
        <div class="space-y-4">
          <Skeleton class="h-8 w-48" />
          <SkeletonText lines={3} />
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 p-8">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <Note class="h-6 w-6 text-text-muted/50" />
      </div>
      <div class="text-center">
        <p class="text-[13px] font-medium text-text">Select a prompt</p>
        <p class="mt-0.5 text-xs text-text-muted">Choose a prompt from the list to view details</p>
      </div>
    </div>
  )
}

function AgentInfoPanel(props: { agent: NonNullable<Prompt["agent"]> }) {
  const tools = () => props.agent.runtimeConfig?.tools ?? []

  return (
    <div class="w-60 shrink-0 space-y-3">
      <div class="flex items-start gap-2.5">
        <EntityIcon icon={props.agent.icon} iconColor={props.agent.iconColor} size={32} />
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-[13px] font-medium text-text">{props.agent.name}</h3>
          <p class="font-code text-2xs text-text-muted">{props.agent.slug}</p>
        </div>
      </div>

      <Show when={props.agent.description}>
        <div class="rounded-md border border-border bg-surface-muted/50 px-2.5 py-2">
          <p class="text-2xs text-text">{props.agent.description}</p>
        </div>
      </Show>

      <Show when={tools().length > 0}>
        <div class="space-y-1">
          <p class="text-2xs font-medium text-text-muted">Tools ({tools().length})</p>
          <div class="divide-y divide-border rounded-md border border-border bg-surface-muted/50">
            <For each={tools()}>
              {(tool) => (
                <div class="px-2.5 py-1.5">
                  <div class="flex items-center gap-1.5">
                    <Wrench class="h-3 w-3 text-text-muted" />
                    <span class="font-code text-2xs text-text">{tool.name}</span>
                  </div>
                  <Show when={tool.description}>
                    <p class="mt-0.5 line-clamp-2 text-2xs text-text-muted">{tool.description}</p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <A
        href={`/agents/${props.agent.id}`}
        class="flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-2xs font-medium text-text transition-colors hover:bg-surface-muted"
      >
        <span>View Agent</span>
        <ArrowSquareOut class="h-3 w-3" />
      </A>
    </div>
  )
}

const AUTO_SAVE_DELAY = 1000

function serializeState(mode: PromptMode, content: string, script: string, inputSchema: unknown): string {
  return serializeConfig({ mode, content, script, inputSchema })
}

export function PromptDetail(props: PromptDetailProps) {
  const [mode, setMode] = createSignal<PromptMode>("template")
  const [content, setContent] = createSignal("")
  const [script, setScript] = createSignal("")
  const [inputSchema, setInputSchema] = createSignal<unknown>(null)
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("idle")
  const [isDirty, setIsDirty] = createSignal(false)
  const [lastSavedHash, setLastSavedHash] = createSignal("")
  const [validation, setValidation] = createSignal<{ status: ValidationStatus; message: string } | null>(null)
  const [highlights, setHighlights] = createSignal<
    { from: number; to: number; status: "ok" | "error"; message?: string }[]
  >([])
  const [editModalOpen, setEditModalOpen] = createSignal(false)
  const [editedName, setEditedName] = createSignal("")
  const [savingEdit, setSavingEdit] = createSignal(false)

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  const hasUndeployedChanges = () => {
    const p = props.prompt
    if (!p) return false
    if (isDirty()) {
      const wcState = serializeState(mode(), content(), script(), inputSchema())
      const releaseState = serializeState(
        p.mode ?? "template",
        p.content ?? "",
        p.script ?? "",
        normalizeInputSchema(p.inputSchema),
      )
      return wcState !== releaseState
    }
    const wc = props.workingCopy
    if (!wc) return false
    return wc.contentHash !== p.contentHash
  }

  const canDeploy = () => {
    if (isDirty()) return false
    const p = props.prompt
    const wc = props.workingCopy
    if (!p || !wc) return false
    if (!p.contentHash) return true
    return wc.contentHash !== p.contentHash
  }

  const handleSave = async () => {
    if (!props.prompt || !props.onSaveWorkingCopy) return
    const currentHash = serializeState(mode(), content(), script(), inputSchema())
    if (currentHash === lastSavedHash()) return

    setSaveStatus("saving")
    try {
      await props.onSaveWorkingCopy(props.prompt.id, {
        mode: mode(),
        content: content(),
        script: script(),
        inputSchema: inputSchema(),
      })
      setLastSavedHash(currentHash)
      setIsDirty(false)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch {
      setSaveStatus("error")
    }
  }

  const scheduleAutoSave = () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }
    autoSaveTimer = setTimeout(() => {
      if (isDirty()) {
        handleSave()
      }
    }, AUTO_SAVE_DELAY)
  }

  const saveImmediately = async () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    if (isDirty()) {
      await handleSave()
    }
  }

  useBeforeLeave((e) => {
    if (isDirty()) {
      e.preventDefault()
      saveImmediately().then(() => {
        if (saveStatus() !== "error") {
          e.retry(true)
        }
      })
    }
  })

  onCleanup(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }
  })

  createEffect(() => {
    const wc = props.workingCopy
    if (wc) {
      const schema = normalizeInputSchema(wc.inputSchema)
      setMode(wc.mode ?? "template")
      setContent(wc.content)
      setScript(wc.script ?? "")
      setInputSchema(schema)
      setLastSavedHash(serializeState(wc.mode ?? "template", wc.content, wc.script ?? "", schema))
      setIsDirty(false)
      setSaveStatus("idle")
    } else if (props.prompt) {
      const schema = normalizeInputSchema(props.prompt.inputSchema)
      setMode(props.prompt.mode ?? "template")
      setContent(props.prompt.content ?? "")
      setScript(props.prompt.script ?? "")
      setInputSchema(schema)
      setLastSavedHash(
        serializeState(props.prompt.mode ?? "template", props.prompt.content ?? "", props.prompt.script ?? "", schema),
      )
      setIsDirty(false)
      setSaveStatus("idle")
    }
  })

  createEffect(() => {
    if (mode() !== "template") {
      setValidation(null)
      setHighlights([])
      return
    }
    const schema = normalizeInputSchema(inputSchema())
    const text = content()
    const result = validateTemplate(text, schema)
    setValidation(result.summary)
    setHighlights(result.highlights)
  })

  const handleModeChange = (newMode: PromptMode) => {
    setMode(newMode)
    const dirty = serializeState(newMode, content(), script(), inputSchema()) !== lastSavedHash()
    setIsDirty(dirty)
    if (dirty) scheduleAutoSave()
  }

  const handleContentChange = (value: string) => {
    setContent(value)
    const dirty = serializeState(mode(), value, script(), inputSchema()) !== lastSavedHash()
    setIsDirty(dirty)
    if (dirty) scheduleAutoSave()
  }

  const handleScriptChange = (value: string) => {
    setScript(value)
    const dirty = serializeState(mode(), content(), value, inputSchema()) !== lastSavedHash()
    setIsDirty(dirty)
    if (dirty) scheduleAutoSave()
  }

  const handleSchemaChange = (schema: unknown) => {
    const normalized = normalizeInputSchema(schema)
    setInputSchema(normalized)
    const dirty = serializeState(mode(), content(), script(), normalized) !== lastSavedHash()
    setIsDirty(dirty)
    if (dirty) scheduleAutoSave()
  }

  const handleDeploy = async (data: { bump: "major" | "minor" | "patch"; description: string }) => {
    const p = props.prompt
    if (!p || !props.onDeploy) return
    await saveImmediately()
    if (isDirty() || saveStatus() === "error") return
    await props.onDeploy(p.id, data.bump, data.description)
  }

  const handleAdopt = async (releaseId: string) => {
    if (!props.prompt || !props.onAdopt) return
    await props.onAdopt(props.prompt.id, releaseId)
  }

  const handleCheckout = async (releaseId: string) => {
    if (!props.prompt || !props.onCheckout) return
    await props.onCheckout(props.prompt.id, releaseId)
  }

  const openEditModal = () => {
    if (!props.prompt) return
    setEditedName(props.prompt.name)
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!props.prompt || !props.onUpdatePrompt) return
    const name = editedName().trim()
    const nameChanged = name && name !== props.prompt.name
    if (!nameChanged) {
      setEditModalOpen(false)
      return
    }
    setSavingEdit(true)
    try {
      await props.onUpdatePrompt(props.prompt.id, { name })
      setEditModalOpen(false)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div class="flex flex-1 flex-col overflow-hidden bg-surface-elevated">
      <Show when={props.loading}>
        <LoadingState />
      </Show>
      <Show when={!props.loading && !props.prompt}>
        <EmptyState />
      </Show>
      <Show when={!props.loading && props.prompt}>
        {(prompt) => (
          <div class="flex-1 overflow-auto">
            <div class="mx-auto flex min-h-full max-w-3xl flex-col px-12 py-8">
              <div class="relative">
                <div class="absolute right-full mr-12">
                  <PromptVariablesPanel schema={inputSchema()} onChange={handleSchemaChange} />
                </div>
                <div class="absolute left-full ml-12">
                  <AgentInfoPanel agent={prompt().agent} />
                </div>
                <div class="mb-1 flex items-center gap-2">
                  <VersionControl
                    currentVersion={prompt().version}
                    currentReleaseId={prompt().currentReleaseId}
                    releases={props.releases ?? []}
                    hasUndeployedChanges={hasUndeployedChanges()}
                    workingCopyUpdatedAt={props.workingCopy?.updatedAt}
                    onAdopt={handleAdopt}
                    onCheckout={handleCheckout}
                  />
                  <div class="ml-auto flex items-center gap-2">
                    <Show when={validation()}>
                      {(v) => (
                        <span
                          class="rounded px-2 py-1 text-2xs font-medium"
                          classList={{
                            "bg-success-soft text-success": v().status === "success",
                            "bg-warning-soft text-warning": v().status === "missing-schema",
                            "bg-danger-soft text-danger": v().status === "error",
                          }}
                        >
                          {v().message}
                        </span>
                      )}
                    </Show>
                    <Show when={saveStatus() === "saving"}>
                      <span class="flex items-center gap-1 text-2xs text-text-muted">
                        <Spinner size="xs" />
                        Saving...
                      </span>
                    </Show>
                    <Show when={saveStatus() === "saved"}>
                      <span class="flex items-center gap-1 text-2xs text-success">
                        <Check class="h-3 w-3" weight="bold" />
                        Saved
                      </span>
                    </Show>
                    <Show when={saveStatus() === "error"}>
                      <span class="text-2xs text-danger">Save failed</span>
                    </Show>
                    <DeployDropdown currentVersion={prompt().version} disabled={!canDeploy()} onDeploy={handleDeploy} />
                  </div>
                </div>
                <button
                  type="button"
                  class="group -ml-2 mb-4 flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-surface-muted"
                  onClick={openEditModal}
                >
                  <h1 class="text-2xl font-bold text-text">{prompt().name}</h1>
                  <PencilSimple class="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100" />
                </button>
                <div class="mb-4 flex gap-1.5">
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                    classList={{
                      "border-accent bg-accent/5 text-text": mode() === "template",
                      "border-border text-text-muted hover:border-border-strong": mode() !== "template",
                    }}
                    onClick={() => handleModeChange("template")}
                  >
                    <Note class="h-3 w-3" />
                    Template
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                    classList={{
                      "border-accent bg-accent/5 text-text": mode() === "script",
                      "border-border text-text-muted hover:border-border-strong": mode() !== "script",
                    }}
                    onClick={() => handleModeChange("script")}
                  >
                    <Code class="h-3 w-3" />
                    Script
                  </button>
                </div>
                <Show when={mode() === "template"}>
                  <div class="-ml-3 flex-1">
                    <CodeEditor
                      value={content()}
                      onChange={handleContentChange}
                      language="markdown"
                      placeholder="Use {{ variable }} placeholders"
                      indent={false}
                      highlights={highlights()}
                    />
                  </div>
                </Show>
                <Show when={mode() === "script"}>
                  <div class="flex-1">
                    <div class="rounded-md border border-border bg-surface">
                      <ScriptSignature
                        paramName="input"
                        paramSchema={inputSchema() as Record<string, unknown> | undefined}
                        fetchResources={async () => {
                          const res = await api.api.resources.$get()
                          if (!res.ok) return []
                          const data = await res.json()
                          return data.map((r) => ({ slug: r.slug, type: r.type }))
                        }}
                      />
                      <CodeEditor
                        value={script()}
                        onChange={handleScriptChange}
                        language="javascript"
                        bordered={false}
                        minLines={20}
                        indent
                        placeholder={`// Return { action: "skip" } to skip execution
// Return { action: "run", prompt: "..." } to run with prompt

return { action: "run", prompt: "Hello" }`}
                      />
                      <ScriptSignature paramName="input" position="footer" />
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Modal
        open={editModalOpen()}
        onBackdropClick={() => setEditModalOpen(false)}
        onEscape={() => setEditModalOpen(false)}
      >
        <ModalContainer size="sm">
          <div class="border-b border-border px-4 py-3">
            <h3 class="text-xs font-medium text-text">Edit prompt</h3>
          </div>
          <ModalBody>
            <div class="flex items-center gap-2">
              <label class="w-16 shrink-0 text-xs text-text-muted">Name</label>
              <Input
                type="text"
                value={editedName()}
                onInput={(e) => setEditedName(e.currentTarget.value)}
                class="h-7 flex-1 text-xs"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveEdit}
                disabled={savingEdit() || !editedName().trim()}
              >
                {savingEdit() && <Spinner size="xs" class="border-white border-t-transparent" />}
                {savingEdit() ? "Saving..." : "Save"}
              </Button>
            </>
          </ModalFooter>
        </ModalContainer>
      </Modal>
    </div>
  )
}

function splitPath(path: string): (string | number)[] {
  const tokens = path.match(/[^.[\]]+/g) ?? []
  return tokens.map((t) => {
    const n = Number(t)
    if (!Number.isNaN(n) && t.trim() !== "") return n
    return t
  })
}

function pathExists(schema: Record<string, unknown>, path: string): boolean {
  const segments = splitPath(path)
  let current: Record<string, unknown> | null = schema
  for (const segment of segments) {
    if (!current) return false
    const type = current.type as string | undefined
    if (type === "object" || current.properties) {
      const p = (current.properties as Record<string, unknown>) ?? {}
      if (typeof segment !== "string") return false
      const next = p[segment]
      if (!next || typeof next !== "object") return false
      current = next as Record<string, unknown>
      continue
    }
    if (type === "array" || current.items) {
      const items = current.items as Record<string, unknown> | undefined
      if (typeof segment !== "number" || !items) return false
      current = items
      continue
    }
    return false
  }
  return true
}

function validateTemplate(
  content: string,
  schema: Record<string, unknown>,
): { summary: { status: ValidationStatus; message: string } | null; highlights: ValidationHighlight[] } {
  const highlights: ValidationHighlight[] = []
  if (!content) return { summary: null, highlights }

  const matches = [...content.matchAll(/{{\s*([^}]+)\s*}}/g)]
  if (matches.length === 0) return { summary: { status: "success", message: "No placeholders" }, highlights }

  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    for (const match of matches) {
      const from = match.index ?? 0
      const to = from + match[0].length
      highlights.push({ from, to, status: "error", message: "Define input schema" })
    }
    return { summary: { status: "missing-schema", message: "Add input schema" }, highlights }
  }

  let errors = 0
  for (const match of matches) {
    const expr = match[1]?.trim() ?? ""
    const from = match.index ?? 0
    const to = from + match[0].length
    if (!expr) {
      errors += 1
      highlights.push({ from, to, status: "error", message: "Empty placeholder" })
      continue
    }
    const ok = pathExists(schema, expr)
    if (!ok) {
      errors += 1
      highlights.push({ from, to, status: "error", message: `Not in schema: ${expr}` })
      continue
    }
    highlights.push({ from, to, status: "ok" })
  }

  if (errors > 0) {
    return {
      summary: { status: "error", message: `${errors} invalid placeholder${errors > 1 ? "s" : ""}` },
      highlights,
    }
  }

  return { summary: { status: "success", message: "All placeholders valid" }, highlights }
}

type ValidationHighlight = { from: number; to: number; status: "ok" | "error"; message?: string }
