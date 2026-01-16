import { Show, For, createSignal, createEffect, on, onMount, createMemo } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import {
  X,
  Code,
  BracketsCurly,
  ChatCircle,
  Brain,
  ListBullets,
  PencilSimple,
  Gear,
  CheckCircle,
  CaretRight,
  CaretDown,
  GitDiff,
  Database,
  Lightning,
  Table,
  ChartLine,
  TextAa,
  ListDashes,
  Queue,
  Warning,
  ArrowUUpLeft,
  UsersThree,
} from "phosphor-solid-js"
import type {
  AgentRuntimeConfig,
  AgentTool,
  AgentModelConfig,
  ModelProvider,
  TypeDef,
  ApprovalAuthority,
  ReasoningConfig,
  SubagentDefinition,
} from "@synatra/core/types"
import { getSystemTools, type SystemToolDefinition } from "@synatra/core/system-tools"
import { ValidJsonSchemaTypes } from "@synatra/util/validate"
import {
  Input,
  Select,
  CodeEditor,
  Checkbox,
  TopLevelSchemaEditor,
  SchemaTypeDisplay,
  FormField,
  Markdown,
  type SelectOption,
  CollapsibleSection,
  Tooltip,
} from "../../../ui"
import type { Agents } from "../../../app/api"
import { type TabItem, getTabKey, getTabLabel } from "./constants"
import { DiffInspector } from "./diff-inspector"
import { ResourceConnectionWizard } from "./resource-connection-wizard"
import { TriggerRequestWizard } from "./trigger-request-wizard"
import type { CopilotResourceRequest, CopilotTriggerRequest } from "./copilot-panel/types"
import { ManagedResourceType, type UserConfigurableResourceType } from "@synatra/core/types"
import { api } from "../../../app"

type ResourceInfo = {
  slug: string
  type: string
}

type CopilotProposal = {
  id: string
  config: AgentRuntimeConfig
  explanation: string
  status: "pending" | "approved" | "rejected"
  createdAt: string
}

type InspectorPanelProps = {
  agentId: string
  agentName: string
  agentSlug: string
  agents: Agents
  config: AgentRuntimeConfig | null
  environmentId?: string | null
  openTabs: TabItem[]
  activeTabKey: string
  onSelectTab: (key: string) => void
  onCloseTab: (key: string) => void
  onConfigChange: <K extends keyof AgentRuntimeConfig>(key: K, value: AgentRuntimeConfig[K]) => void
  onTypeRename: (oldName: string, newName: string) => void
  pendingProposal?: CopilotProposal | null
  onApproveProposal?: () => void
  onRejectProposal?: () => void
  approvingProposal?: boolean
  rejectingProposal?: boolean
  pendingResourceRequest?: CopilotResourceRequest | null
  onResourceCreate?: (data: {
    name: string
    slug?: string
    description?: string
    type: UserConfigurableResourceType
  }) => Promise<{ resourceId: string }>
  onResourceRequestCancel?: () => void
  creatingResource?: boolean
  confirmingResource?: { requestId: string; resourceId: string } | null
  onConfirmationComplete?: (requestId: string, resourceId: string) => Promise<void>
  pendingTriggerRequest?: CopilotTriggerRequest | null
  onTriggerRequestApprove?: (requestId: string) => Promise<void>
  onTriggerRequestCancel?: (requestId: string) => Promise<void>
  approvingTriggerRequest?: boolean
  cancellingTriggerRequest?: boolean
}

const providerOptions: SelectOption<ModelProvider>[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
]

const modelPresets: Record<ModelProvider, SelectOption<string>[]> = {
  openai: [
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-5.1", label: "GPT-5.1" },
    { value: "o3", label: "o3" },
    { value: "o4-mini", label: "o4 Mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
  ],
  google: [
    { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
}

const approvalAuthorityOptions: SelectOption<ApprovalAuthority>[] = [
  { value: "any_member", label: "Any member" },
  { value: "owner_only", label: "Channel owners only" },
]

const approvalTimeoutOptions: SelectOption<number>[] = [
  { value: 3600000, label: "1 hour" },
  { value: 86400000, label: "24 hours" },
  { value: 259200000, label: "72 hours" },
  { value: 604800000, label: "1 week" },
]

const effortOptions: SelectOption<string>[] = [
  { value: "", label: "Disabled" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
]

const levelOptions: SelectOption<string>[] = [
  { value: "", label: "Disabled" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
]

type ExecutionLimits = {
  maxIterations?: number
  maxToolCallsPerIteration?: number
  maxActiveTimeMs?: number
  humanRequestTimeoutMs?: number
}

function ModelInspector(props: {
  model: AgentModelConfig
  limits: ExecutionLimits
  environmentId?: string | null
  onUpdate: (model: AgentModelConfig) => void
  onUpdateLimits: (limits: ExecutionLimits) => void
}) {
  const presets = () => modelPresets[props.model.provider] ?? []
  const [customMode, setCustomMode] = createSignal(false)

  const synatraAiQuery = useQuery(() => ({
    queryKey: ["resources", "managed", "synatra_ai"],
    queryFn: async () => {
      const res = await api.api.resources.managed[":type"].$get({ param: { type: "synatra_ai" } })
      if (!res.ok) throw new Error("Failed to fetch synatra_ai resource")
      return res.json()
    },
    staleTime: 60000,
  }))

  const configuredProviders = createMemo(() => {
    const synatraAi = synatraAiQuery.data
    if (!synatraAi || !props.environmentId) return new Set<ModelProvider>()
    const envConfig = synatraAi.configs.find((c) => c.environmentId === props.environmentId)
    if (!envConfig?.config) return new Set<ModelProvider>()
    const config = envConfig.config as {
      openai?: { hasApiKey?: boolean; enabled?: boolean }
      anthropic?: { hasApiKey?: boolean; enabled?: boolean }
      google?: { hasApiKey?: boolean; enabled?: boolean }
    }
    const isEnabled = (p?: { hasApiKey?: boolean; enabled?: boolean }) => p?.hasApiKey && (p.enabled ?? true)
    const providers: ModelProvider[] = []
    if (isEnabled(config.openai)) providers.push("openai")
    if (isEnabled(config.anthropic)) providers.push("anthropic")
    if (isEnabled(config.google)) providers.push("google")
    return new Set(providers)
  })

  const isProviderConfigured = (provider: ModelProvider) => !props.environmentId || configuredProviders().has(provider)

  const providerOptionsWithStatus = createMemo(() =>
    providerOptions.map((opt) => ({
      ...opt,
      label: isProviderConfigured(opt.value) ? opt.label : `${opt.label} (Not configured)`,
      disabled: false,
    })),
  )

  createEffect(() => {
    const isPreset = presets().some((p) => p.value === props.model.model)
    if (!isPreset && props.model.model) {
      setCustomMode(true)
    }
  })

  const updateField = <K extends keyof AgentModelConfig>(key: K, value: AgentModelConfig[K]) => {
    props.onUpdate({ ...props.model, [key]: value })
  }

  const updateReasoning = (field: keyof ReasoningConfig, value: unknown) => {
    const current = props.model.reasoning ?? {}
    const updated = { ...current, [field]: value || undefined }
    const hasValue = Object.values(updated).some((v) => v !== undefined)
    updateField("reasoning", hasValue ? updated : undefined)
  }

  const handleProviderChange = (provider: ModelProvider) => {
    const defaultModel = modelPresets[provider]?.[0]?.value ?? ""
    props.onUpdate({ ...props.model, provider, model: defaultModel })
    setCustomMode(false)
  }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Provider">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Provider">
            <div class="flex items-center gap-2">
              <Select
                value={props.model.provider}
                options={providerOptionsWithStatus()}
                onChange={handleProviderChange}
              />
              <Show when={!isProviderConfigured(props.model.provider)}>
                <Tooltip content="Configure API key in Resources > Synatra AI">
                  <Warning class="h-4 w-4 text-warning" />
                </Tooltip>
              </Show>
            </div>
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Model">
            <div class="group/model relative">
              <button
                type="button"
                class="absolute -left-6 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-text group-hover/model:opacity-100"
                onClick={() => {
                  if (customMode()) {
                    const first = presets()[0]?.value ?? ""
                    updateField("model", first)
                  }
                  setCustomMode(!customMode())
                }}
                title={customMode() ? "Switch to presets" : "Switch to custom input"}
              >
                <Show when={customMode()} fallback={<PencilSimple class="h-3.5 w-3.5" />}>
                  <ListBullets class="h-3.5 w-3.5" />
                </Show>
              </button>
              <Show
                when={customMode()}
                fallback={
                  <Select value={props.model.model} options={presets()} onChange={(v) => updateField("model", v)} />
                }
              >
                <Input
                  type="text"
                  value={props.model.model}
                  onInput={(e) => updateField("model", e.currentTarget.value)}
                  placeholder="model-id"
                  class="font-code text-xs"
                />
              </Show>
            </div>
          </FormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Temperature">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={props.model.temperature}
              onInput={(e) => updateField("temperature", parseFloat(e.currentTarget.value) || 0.7)}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Top P">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={props.model.topP ?? ""}
              onInput={(e) => {
                const val = parseFloat(e.currentTarget.value)
                updateField("topP", isNaN(val) ? undefined : val)
              }}
              placeholder="1.0"
              class="w-24 text-xs"
            />
          </FormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Reasoning">
        <div class="space-y-3">
          <Show when={props.model.provider === "openai"}>
            <FormField horizontal labelWidth="6rem" label="Effort">
              <Select
                value={props.model.reasoning?.effort ?? ""}
                options={effortOptions}
                onChange={(v) => updateReasoning("effort", v)}
              />
            </FormField>
          </Show>
          <Show when={props.model.provider === "anthropic"}>
            <FormField horizontal labelWidth="6rem" label="Budget">
              <Input
                type="number"
                min="1024"
                max="128000"
                step="1024"
                value={props.model.reasoning?.budgetTokens ?? ""}
                onInput={(e) => {
                  const val = parseInt(e.currentTarget.value)
                  updateReasoning("budgetTokens", isNaN(val) ? undefined : val)
                }}
                placeholder="e.g. 12000"
                class="w-24 text-xs"
              />
            </FormField>
          </Show>
          <Show when={props.model.provider === "google"}>
            <FormField horizontal labelWidth="6rem" label="Level">
              <Select
                value={props.model.reasoning?.level ?? ""}
                options={levelOptions}
                onChange={(v) => updateReasoning("level", v)}
              />
            </FormField>
          </Show>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Limits">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Iterations">
            <Input
              type="number"
              min="1"
              max="100"
              step="1"
              value={props.limits.maxIterations ?? 10}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                props.onUpdateLimits({ ...props.limits, maxIterations: isNaN(val) ? 10 : val })
              }}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Tools/iter">
            <Input
              type="number"
              min="1"
              max="50"
              step="1"
              value={props.limits.maxToolCallsPerIteration ?? 10}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                props.onUpdateLimits({ ...props.limits, maxToolCallsPerIteration: isNaN(val) ? 10 : val })
              }}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Active time (ms)">
            <Input
              type="number"
              min="30000"
              max="3600000"
              step="1000"
              value={props.limits.maxActiveTimeMs ?? 600000}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                props.onUpdateLimits({ ...props.limits, maxActiveTimeMs: isNaN(val) ? 600000 : val })
              }}
              class="w-24 text-xs"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Human timeout">
            <Select
              options={approvalTimeoutOptions}
              value={props.limits.humanRequestTimeoutMs ?? 259200000}
              onChange={(v) => props.onUpdateLimits({ ...props.limits, humanRequestTimeoutMs: v })}
              class="w-24 text-xs"
            />
          </FormField>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function PromptInspector(props: { systemPrompt: string; onUpdatePrompt: (prompt: string) => void }) {
  return (
    <div class="space-y-0">
      <CollapsibleSection title="Instructions">
        <CodeEditor
          value={props.systemPrompt}
          onChange={props.onUpdatePrompt}
          language="text"
          placeholder="You are a helpful assistant..."
          minLines={8}
          indent={false}
          bordered
        />
      </CollapsibleSection>
    </div>
  )
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
  if (type === "restapi") {
    return [
      {
        name: "request",
        params: [
          { name: "method", type: '"GET" | "POST" | "PUT" | "PATCH" | "DELETE"' },
          { name: "path", type: "string" },
          { name: "headers", type: "Record<string, string>", optional: true },
          { name: "queryParams", type: "Record<string, string>", optional: true },
          { name: "body", type: "unknown", optional: true },
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

function ToolInspector(props: {
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

function TypeInspector(props: {
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

const versionModeOptions: SelectOption<"current" | "fixed">[] = [
  { value: "current", label: "Current (always latest)" },
  { value: "fixed", label: "Fixed release" },
]

type ReleaseInfo = { id: string; version: string }

function SubagentInspector(props: {
  subagent: SubagentDefinition
  agents: Agents
  currentAgentId: string
  onUpdate: (subagent: SubagentDefinition) => void
}) {
  const [releases, setReleases] = createSignal<ReleaseInfo[]>([])

  const availableAgents = () => props.agents.filter((a) => a.id !== props.currentAgentId)

  const agentOptions = () =>
    availableAgents().map((a) => ({
      value: a.id,
      label: a.name,
    }))

  const selectedAgent = () => props.agents.find((a) => a.id === props.subagent.agentId)

  const releaseOptions = () =>
    releases().map((r) => ({
      value: r.id,
      label: r.version,
    }))

  const fetchReleases = async (agentId: string) => {
    if (!agentId) {
      setReleases([])
      return
    }
    try {
      const res = await api.api.agents[":id"].releases.$get({ param: { id: agentId } })
      if (res.ok) {
        const data = await res.json()
        setReleases(data.map((r) => ({ id: r.id, version: r.version })))
      }
    } catch {
      setReleases([])
    }
  }

  createEffect(
    on(
      () => props.subagent.agentId,
      (id) => fetchReleases(id),
    ),
  )

  const updateField = <K extends keyof SubagentDefinition>(key: K, value: SubagentDefinition[K]) => {
    props.onUpdate({ ...props.subagent, [key]: value })
  }

  const handleAgentChange = (agentId: string) => {
    const agent = props.agents.find((a) => a.id === agentId)
    const updated: SubagentDefinition = {
      ...props.subagent,
      agentId,
      alias: agent?.slug,
    }
    if (props.subagent.versionMode === "fixed") {
      updated.releaseId = agent?.currentReleaseId ?? undefined
    }
    props.onUpdate(updated)
  }

  const handleVersionModeChange = (mode: "current" | "fixed") => {
    const updated: SubagentDefinition = { ...props.subagent, versionMode: mode }
    if (mode === "current") {
      delete updated.releaseId
    } else if (mode === "fixed") {
      const agent = selectedAgent()
      updated.releaseId = agent?.currentReleaseId ?? undefined
    }
    props.onUpdate(updated)
  }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Settings">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Agent">
            <Select
              value={props.subagent.agentId}
              options={agentOptions()}
              onChange={handleAgentChange}
              placeholder="Select an agent"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Alias">
            <Input
              type="text"
              value={props.subagent.alias ?? ""}
              onInput={(e) => updateField("alias", e.currentTarget.value || undefined)}
              class="text-xs font-code"
              placeholder={selectedAgent()?.slug ?? "alias"}
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Description">
            <Input
              type="text"
              value={props.subagent.description}
              onInput={(e) => updateField("description", e.currentTarget.value)}
              class="text-xs"
              placeholder="What this subagent handles"
            />
          </FormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Version">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Mode">
            <Select
              value={props.subagent.versionMode}
              options={versionModeOptions}
              onChange={handleVersionModeChange}
            />
          </FormField>
          <Show when={props.subagent.versionMode === "fixed"}>
            <FormField horizontal labelWidth="6rem" label="Release">
              <Select
                value={props.subagent.releaseId ?? ""}
                options={releaseOptions()}
                onChange={(v) => updateField("releaseId", v || undefined)}
                placeholder="Select a release"
              />
            </FormField>
          </Show>
        </div>
      </CollapsibleSection>

      <Show when={selectedAgent()}>
        {(agent) => (
          <CollapsibleSection title="Preview">
            <div class="space-y-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="text-text-muted">Tool name:</span>
                <code class="font-code text-accent">delegate_to_{props.subagent.alias || agent().slug}()</code>
              </div>
              <div class="rounded border border-border bg-surface-muted p-2 text-text-muted">
                <p>{props.subagent.description || "No description"}</p>
              </div>
            </div>
          </CollapsibleSection>
        )}
      </Show>
    </div>
  )
}

type ParameterDef = {
  name: string
  type: string
  required?: boolean
  description: string
  children?: ParameterDef[]
}

function ParameterItem(props: { param: ParameterDef; parentPath?: string }) {
  const [expanded, setExpanded] = createSignal(false)
  const hasChildren = () => props.param.children && props.param.children.length > 0
  const fullPath = () => (props.parentPath ? `${props.parentPath}.${props.param.name}` : props.param.name)

  return (
    <div class="border-t border-border first:border-t-0">
      <div class="flex flex-col gap-1.5 px-3 py-2.5">
        <div class="flex items-center gap-2 flex-wrap">
          <code class="font-code text-[11px]">
            <Show when={props.parentPath}>
              <span class="text-text-muted">{props.parentPath}.</span>
            </Show>
            <span class="text-text">{props.param.name}</span>
          </code>
          <span class="text-[10px] text-text-muted">{props.param.type}</span>
          <Show when={props.param.required}>
            <span class="text-[10px] text-warning">required</span>
          </Show>
        </div>
        <p class="text-[11px] text-text-muted leading-relaxed">{props.param.description}</p>
        <Show when={hasChildren()}>
          <div class="flex items-center gap-2 mt-1">
            <button
              type="button"
              class="flex items-center gap-1.5 text-[10px] text-accent hover:text-accent-hover transition-colors"
              onClick={() => setExpanded(!expanded())}
            >
              <Show when={expanded()} fallback={<CaretRight class="h-2.5 w-2.5" />}>
                <CaretDown class="h-2.5 w-2.5" />
              </Show>
              <span>{expanded() ? "Hide" : "Show"} child attributes</span>
            </button>
            <Show when={expanded()}>
              <span class="flex-1 h-px bg-border" />
            </Show>
          </div>
        </Show>
      </div>
      <Show when={hasChildren() && expanded()}>
        <div class="border-l-2 border-border ml-3">
          <For each={props.param.children}>{(child) => <ParameterItem param={child} parentPath={fullPath()} />}</For>
        </div>
      </Show>
    </div>
  )
}

function ParameterList(props: { params: ParameterDef[] }) {
  return (
    <div class="rounded-md border border-border bg-surface overflow-hidden">
      <For each={props.params}>{(param) => <ParameterItem param={param} />}</For>
    </div>
  )
}

const TOOL_SAMPLES: Record<string, object> = {
  output_table: {
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
    ],
    data: [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ],
    name: "Users",
  },
  output_chart: {
    type: "line",
    data: {
      labels: ["Jan", "Feb", "Mar"],
      datasets: [{ label: "Sales", data: [100, 150, 200] }],
    },
    name: "Monthly Sales",
  },
  output_markdown: {
    content: "## Summary\n\n- Item 1\n- Item 2",
    name: "Report",
  },
  output_key_value: {
    pairs: { Environment: "Production", Version: "1.2.3" },
    name: "Status",
  },
  human_request: {
    title: "Complete Setup",
    description: "Please provide the required information.",
    fields: [
      {
        kind: "form",
        key: "profile",
        schema: { type: "object", properties: { name: { type: "string", title: "Name" } }, required: ["name"] },
      },
      {
        kind: "question",
        key: "framework",
        questions: [
          {
            question: "Which framework should we use?",
            header: "Framework",
            options: [
              { label: "React", description: "Popular frontend library" },
              { label: "Vue", description: "Progressive framework" },
            ],
            multiSelect: false,
          },
        ],
      },
    ],
    allowCancel: true,
    allowSkip: false,
  },
  task_complete: {
    summary: "## Task Completed\n\nCreated user account:\n- **Email:** john@example.com\n- **Role:** Admin",
  },
  return_to_parent: {
    result: { status: "success", data: { userId: "123" } },
    summary: "Fetched user data successfully.",
  },
}

const TOOL_PARAMS: Record<string, ParameterDef[]> = {
  output_table: [
    {
      name: "columns",
      type: "array",
      required: true,
      description: "Column definitions.",
      children: [
        { name: "key", type: "string", required: true, description: "Property key in data objects." },
        { name: "label", type: "string", required: true, description: "Column header text." },
      ],
    },
    { name: "data", type: "object[]", required: true, description: "Array of row objects." },
    { name: "name", type: "string", description: "Optional table title." },
  ],
  output_chart: [
    { name: "type", type: "enum", required: true, description: "Chart type: 'line', 'bar', or 'pie'." },
    {
      name: "data",
      type: "object",
      required: true,
      description: "Chart.js compatible data object.",
      children: [
        { name: "labels", type: "string[]", required: true, description: "X-axis labels." },
        {
          name: "datasets",
          type: "array",
          required: true,
          description: "Array of dataset objects.",
          children: [
            { name: "label", type: "string", description: "Dataset legend label." },
            { name: "data", type: "number[]", required: true, description: "Data values." },
          ],
        },
      ],
    },
    { name: "name", type: "string", description: "Optional chart title." },
  ],
  output_markdown: [
    { name: "content", type: "string", required: true, description: "Markdown formatted text content." },
    { name: "name", type: "string", description: "Optional label for the output." },
  ],
  output_key_value: [
    { name: "pairs", type: "Record<string, string>", required: true, description: "Key-value pairs to display." },
    { name: "name", type: "string", description: "Optional title." },
  ],
  human_request: [
    { name: "title", type: "string", required: true, description: "Request title displayed to user." },
    { name: "description", type: "string", description: "Instructions or context." },
    {
      name: "fields",
      type: "array",
      required: true,
      description: "Input fields to collect.",
      children: [
        {
          name: "kind",
          type: "enum",
          required: true,
          description: "Field type: form, question, select_rows, confirm.",
        },
        { name: "key", type: "string", required: true, description: "Result key for this field." },
        { name: "schema", type: "object", description: "JSON Schema for form fields." },
        { name: "questions", type: "array", description: "Questions for question fields." },
        { name: "columns", type: "array", description: "Column definitions for select_rows." },
        { name: "data", type: "array", description: "Row data for select_rows." },
        { name: "variant", type: "enum", description: "Visual style for confirm: info, warning, danger." },
      ],
    },
    { name: "allowCancel", type: "boolean", description: "Show Cancel button (default: true)." },
    { name: "allowSkip", type: "boolean", description: "Show Skip button (default: false)." },
  ],
  task_complete: [{ name: "summary", type: "string", description: "Markdown summary of what was accomplished." }],
  return_to_parent: [
    { name: "result", type: "object", required: true, description: "Structured result data to return to parent." },
    { name: "summary", type: "string", description: "Brief summary of what was accomplished." },
  ],
}

function OutputTableInspector() {
  const [showParams, setShowParams] = createSignal(false)
  const sample = TOOL_SAMPLES.output_table as {
    columns: { key: string; label: string }[]
    data: Record<string, string>[]
    name: string
  }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display data as a formatted table. Ideal for showing structured data like lists, records, or query results.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_table} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface overflow-hidden">
            <div class="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
              <Table class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">{sample.name}</span>
            </div>
            <table class="w-full text-[10px]">
              <thead>
                <tr class="bg-surface-muted">
                  <For each={sample.columns}>
                    {(col) => <th class="px-2.5 py-1.5 text-left font-medium text-text-muted">{col.label}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={sample.data}>
                  {(row) => (
                    <tr class="border-t border-border/50">
                      <For each={sample.columns}>
                        {(col) => <td class="px-2.5 py-1.5 text-text">{row[col.key]}</td>}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_table, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function OutputChartInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display line, bar, or pie charts. Uses Chart.js compatible data format for flexible visualization.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_chart} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <ChartLine class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">Monthly Sales</span>
            </div>
            <div class="flex items-center justify-center py-6 text-text-muted bg-surface-muted rounded">
              <ChartLine class="h-8 w-8 opacity-40" weight="duotone" />
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_chart, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function OutputMarkdownInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display markdown formatted content. Supports GitHub Flavored Markdown for rich text output.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_markdown} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <TextAa class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">Report</span>
            </div>
            <div class="[&_h2]:text-xs! [&_p]:text-[10px]! [&_li]:text-[10px]!">
              <Markdown class="text-text">{(TOOL_SAMPLES.output_markdown as { content: string }).content}</Markdown>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_markdown, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function OutputKeyValueInspector() {
  const [showParams, setShowParams] = createSignal(false)
  const sample = TOOL_SAMPLES.output_key_value as { pairs: Record<string, string>; name: string }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display key-value pairs in a compact table format. Ideal for status information, metadata, or configuration.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_key_value} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface overflow-hidden">
            <div class="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
              <ListDashes class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">{sample.name}</span>
            </div>
            <table class="w-full text-[10px]">
              <tbody>
                <For each={Object.entries(sample.pairs)}>
                  {([key, value]) => (
                    <tr class="border-t border-border/50 first:border-t-0">
                      <td class="px-2.5 py-1.5 font-medium text-text-muted w-1/3">{key}</td>
                      <td class="px-2.5 py-1.5 text-text">{value}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_key_value, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function HumanRequestInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Request user input. Supports multiple field types: form (JSON Schema), question (multiple choice), select_rows
          (table selection), and confirm (yes/no). Pauses workflow until user responds.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.human_request} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <Queue class="h-3.5 w-3.5 text-success" weight="duotone" />
              <span class="text-[10px] font-medium text-text">Complete Setup</span>
              <span class="ml-auto text-[9px] text-success bg-success/10 px-1 py-0.5 rounded">input</span>
            </div>
            <p class="text-[10px] text-text-muted mb-2">Please provide the required information.</p>
            <div class="space-y-2">
              <div class="rounded border border-border/50 p-2">
                <span class="text-[9px] text-text-muted">profile (form)</span>
                <div class="h-5 mt-1 rounded bg-surface-muted" />
              </div>
              <div class="rounded border border-border/50 p-2">
                <span class="text-[9px] text-text-muted">framework (question)</span>
                <p class="text-[10px] text-text mt-1">Which framework should we use?</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.human_request, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function TaskCompleteInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Mark the current task as completed. Use this when the user's request has been fully resolved. The summary is
          displayed to the user in a completion card.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.task_complete} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-success/30 bg-success/5 p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <CheckCircle class="h-3.5 w-3.5 text-success" weight="duotone" />
              <span class="text-[10px] font-medium text-success">Completed</span>
            </div>
            <div class="[&_h2]:text-xs! [&_p]:text-[10px]! [&_li]:text-[10px]! [&_strong]:text-[10px]!">
              <Markdown class="text-text">{(TOOL_SAMPLES.task_complete as { summary: string }).summary}</Markdown>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.task_complete, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function ReturnToParentInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Return a result to the parent run and complete this subagent run. Only available when depth {">"} 0 (i.e.,
          running as a subagent).
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.return_to_parent} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-accent/30 bg-accent/5 p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <ArrowUUpLeft class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-accent">Returning to parent</span>
            </div>
            <p class="text-[10px] text-text-muted">{(TOOL_SAMPLES.return_to_parent as { summary: string }).summary}</p>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.return_to_parent, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function SystemToolInspector(props: { tool: SystemToolDefinition }) {
  const name = () => props.tool.name

  return (
    <>
      <Show when={name() === "output_table"}>
        <OutputTableInspector />
      </Show>
      <Show when={name() === "output_chart"}>
        <OutputChartInspector />
      </Show>
      <Show when={name() === "output_markdown"}>
        <OutputMarkdownInspector />
      </Show>
      <Show when={name() === "output_key_value"}>
        <OutputKeyValueInspector />
      </Show>
      <Show when={name() === "human_request"}>
        <HumanRequestInspector />
      </Show>
      <Show when={name() === "task_complete"}>
        <TaskCompleteInspector />
      </Show>
      <Show when={name() === "return_to_parent"}>
        <ReturnToParentInspector />
      </Show>
      <Show
        when={
          ![
            "output_table",
            "output_chart",
            "output_markdown",
            "output_key_value",
            "human_request",
            "task_complete",
            "return_to_parent",
          ].includes(name())
        }
      >
        <div class="space-y-0">
          <CollapsibleSection title="Overview">
            <p class="text-xs text-text-muted leading-relaxed">{props.tool.description}</p>
          </CollapsibleSection>
        </div>
      </Show>
    </>
  )
}

function getTabIcon(tab: TabItem) {
  if (tab.type === "tool") return Code
  if (tab.type === "type") return BracketsCurly
  if (tab.type === "prompt") return ChatCircle
  if (tab.type === "model") return Brain
  if (tab.type === "system_tool") return Gear
  if (tab.type === "subagent") return UsersThree
  if (tab.type === "diff") return GitDiff
  if (tab.type === "connect_resource") return Database
  if (tab.type === "trigger_request") return Lightning
  return Brain
}

function getTabIconClass(tab: TabItem): string {
  if (tab.type === "tool") return "text-success"
  if (tab.type === "type") return "text-accent"
  if (tab.type === "prompt") return "text-accent"
  if (tab.type === "model") return "text-text-muted"
  if (tab.type === "system_tool") return "text-text-muted"
  if (tab.type === "subagent") return "text-warning"
  if (tab.type === "diff") return "text-warning"
  if (tab.type === "connect_resource") return "text-accent"
  if (tab.type === "trigger_request") return "text-warning"
  return "text-text-muted"
}

export function InspectorPanel(props: InspectorPanelProps) {
  const updateTool = (index: number, tool: AgentTool) => {
    if (!props.config) return
    const updated = [...(props.config.tools ?? [])]
    updated[index] = tool
    props.onConfigChange("tools", updated)
  }

  const updateType = (name: string, typeDef: TypeDef) => {
    if (!props.config) return
    const updated = { ...(props.config.$defs ?? {}), [name]: typeDef }
    props.onConfigChange("$defs", updated)
  }

  const updateSubagent = (index: number, subagent: SubagentDefinition) => {
    if (!props.config) return
    const updated = [...(props.config.subagents ?? [])]
    updated[index] = subagent
    props.onConfigChange("subagents", updated)
  }

  const activeTab = () => props.openTabs.find((t) => getTabKey(t) === props.activeTabKey)
  const activeFunctionIndex = () => {
    const tab = activeTab()
    return tab?.type === "tool" ? tab.index : -1
  }
  const activeTypeName = () => {
    const tab = activeTab()
    return tab?.type === "type" ? tab.name : null
  }
  const activeSystemToolName = () => {
    const tab = activeTab()
    return tab?.type === "system_tool" ? tab.name : null
  }
  const activeSubagentIndex = () => {
    const tab = activeTab()
    return tab?.type === "subagent" ? tab.index : -1
  }

  const availableRefs = () => Object.keys(props.config?.$defs ?? {})

  return (
    <div class="flex h-full flex-col bg-surface-elevated">
      <Show when={props.openTabs.length > 0}>
        <div class="flex h-8 items-center overflow-x-auto border-b border-border bg-surface-elevated scrollbar-none">
          <For each={props.openTabs}>
            {(tab) => {
              const key = getTabKey(tab)
              const isValid = () => {
                if (tab.type === "tool") {
                  return (props.config?.tools?.length ?? 0) > tab.index
                }
                if (tab.type === "type") {
                  return tab.name in (props.config?.$defs ?? {})
                }
                if (tab.type === "system_tool") {
                  return getSystemTools().some((t: SystemToolDefinition) => t.name === tab.name)
                }
                if (tab.type === "subagent") {
                  return (props.config?.subagents?.length ?? 0) > tab.index
                }
                return true
              }
              const isActive = () => props.activeTabKey === key
              const Icon = getTabIcon(tab)
              return (
                <Show when={isValid()}>
                  <div
                    class="group flex h-full shrink-0 cursor-pointer items-center gap-1 px-2.5 text-xs transition-colors"
                    classList={{
                      "bg-surface-muted text-text": isActive(),
                      "text-text-muted hover:text-text hover:bg-surface-muted": !isActive(),
                    }}
                    onClick={() => props.onSelectTab(key)}
                  >
                    <Icon class={`h-3.5 w-3.5 shrink-0 ${getTabIconClass(tab)}`} weight="duotone" />
                    <span class="max-w-[120px] truncate">{getTabLabel(tab, props.config, props.agents)}</span>
                    <button
                      type="button"
                      class="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
                      classList={{ "opacity-100": isActive() }}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onCloseTab(key)
                      }}
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                </Show>
              )
            }}
          </For>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show
          when={activeTab() && props.config}
          fallback={
            <div class="flex h-full items-center justify-center text-xs text-text-muted">
              Select an item from the outline
            </div>
          }
        >
          <Show when={activeTab()?.type === "model"}>
            <ModelInspector
              model={props.config!.model}
              limits={{
                maxIterations: props.config!.maxIterations,
                maxToolCallsPerIteration: props.config!.maxToolCallsPerIteration,
                maxActiveTimeMs: props.config!.maxActiveTimeMs,
                humanRequestTimeoutMs: props.config!.humanRequestTimeoutMs,
              }}
              environmentId={props.environmentId}
              onUpdate={(model) => props.onConfigChange("model", model)}
              onUpdateLimits={(limits) => {
                if (limits.maxIterations !== props.config!.maxIterations) {
                  props.onConfigChange("maxIterations", limits.maxIterations)
                }
                if (limits.maxToolCallsPerIteration !== props.config!.maxToolCallsPerIteration) {
                  props.onConfigChange("maxToolCallsPerIteration", limits.maxToolCallsPerIteration)
                }
                if (limits.maxActiveTimeMs !== props.config!.maxActiveTimeMs) {
                  props.onConfigChange("maxActiveTimeMs", limits.maxActiveTimeMs)
                }
                if (limits.humanRequestTimeoutMs !== props.config!.humanRequestTimeoutMs) {
                  props.onConfigChange("humanRequestTimeoutMs", limits.humanRequestTimeoutMs)
                }
              }}
            />
          </Show>
          <Show when={activeTab()?.type === "prompt"}>
            <PromptInspector
              systemPrompt={props.config!.systemPrompt}
              onUpdatePrompt={(prompt) => props.onConfigChange("systemPrompt", prompt)}
            />
          </Show>
          <Show when={activeFunctionIndex() >= 0}>
            {(() => {
              const tool = () => props.config!.tools?.[activeFunctionIndex()]
              const toolNames = () => props.config!.tools?.map((t) => t.name) ?? []
              return (
                <Show when={tool()}>
                  <ToolInspector
                    tool={tool()!}
                    index={activeFunctionIndex()}
                    availableRefs={availableRefs()}
                    existingNames={toolNames()}
                    onUpdate={(t) => updateTool(activeFunctionIndex(), t)}
                  />
                </Show>
              )
            })()}
          </Show>
          <Show when={activeTypeName()}>
            {(name) => {
              const typeDef = () => props.config!.$defs?.[name()]
              return (
                <Show when={typeDef()}>
                  <TypeInspector
                    name={name()}
                    typeDef={typeDef()!}
                    availableRefs={availableRefs()}
                    onUpdate={(td) => updateType(name(), td)}
                    onRename={(newName) => props.onTypeRename(name(), newName)}
                  />
                </Show>
              )
            }}
          </Show>
          <Show when={activeSystemToolName()}>
            {(name) => {
              const tool = () => getSystemTools().find((t: SystemToolDefinition) => t.name === name())
              return (
                <Show when={tool()}>
                  <SystemToolInspector tool={tool()!} />
                </Show>
              )
            }}
          </Show>
          <Show when={activeSubagentIndex() >= 0}>
            {(() => {
              const subagent = () => props.config!.subagents?.[activeSubagentIndex()]
              return (
                <Show when={subagent()}>
                  <SubagentInspector
                    subagent={subagent()!}
                    agents={props.agents}
                    currentAgentId={props.agentId}
                    onUpdate={(s) => updateSubagent(activeSubagentIndex(), s)}
                  />
                </Show>
              )
            })()}
          </Show>
          <Show when={activeTab()?.type === "diff" && props.pendingProposal && props.config}>
            <DiffInspector
              before={props.config!}
              after={props.pendingProposal!.config}
              onApprove={() => props.onApproveProposal?.()}
              onReject={() => props.onRejectProposal?.()}
              approving={props.approvingProposal ?? false}
              rejecting={props.rejectingProposal ?? false}
            />
          </Show>
          <Show
            when={
              activeTab()?.type === "connect_resource" && (props.pendingResourceRequest || props.confirmingResource)
            }
          >
            <ResourceConnectionWizard
              request={props.pendingResourceRequest!}
              confirmingResource={props.confirmingResource}
              onComplete={async (data) => {
                if (!props.onResourceCreate) return { resourceId: "" }
                return props.onResourceCreate(data)
              }}
              onConfirmationComplete={props.onConfirmationComplete}
              onCancel={() => props.onResourceRequestCancel?.()}
              saving={props.creatingResource}
            />
          </Show>
          <Show when={activeTab()?.type === "trigger_request" && props.pendingTriggerRequest}>
            <TriggerRequestWizard
              request={props.pendingTriggerRequest!}
              onApprove={async (requestId) => {
                if (!props.onTriggerRequestApprove) return
                await props.onTriggerRequestApprove(requestId)
              }}
              onCancel={async (requestId) => {
                if (!props.onTriggerRequestCancel) return
                await props.onTriggerRequestCancel(requestId)
              }}
              approving={props.approvingTriggerRequest}
              cancelling={props.cancellingTriggerRequest}
            />
          </Show>
        </Show>
      </div>
    </div>
  )
}
