import {
  generateText,
  tool,
  jsonSchema,
  type JSONSchema7,
  type JSONValue,
  type ModelMessage,
  type ToolResultPart,
} from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { AgentModelConfig, AgentRuntimeConfig, ModelProvider, ToolCallRecord } from "@synatra/core/types"
import { getSystemTools, type SubagentConfig } from "@synatra/core/system-tools"

export interface ResolvedLlmConfig {
  apiKey: string
  baseUrl?: string | null
}

export type ConversationMessage =
  | { role: "user"; content: string; messageId?: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCallRecord[] }
  | { role: "tool"; toolCallId: string; toolName: string; result: string }

export interface CallLLMInput {
  agentConfig: AgentRuntimeConfig
  messages: ConversationMessage[]
  timeoutMs?: number
  depth?: number
  subagents?: SubagentConfig[]
  llmConfig: ResolvedLlmConfig
}

export type CallLLMResult =
  | {
      type: "text"
      content: string
      rawResponse: unknown
      durationMs: number
      usage?: { inputTokens: number; outputTokens: number }
    }
  | {
      type: "tool_calls"
      toolCalls: ToolCallRecord[]
      rawResponse: unknown
      durationMs: number
      usage?: { inputTokens: number; outputTokens: number }
    }
  | { type: "error"; reason: "timeout" | "abort"; error: string; durationMs: number }

const HUMAN_REQUEST_INSTRUCTIONS = `
### Human Request Tool (BLOCKS execution)

Use \`human_request\` when you need information from the user. Execution pauses until user responds.

\`\`\`
human_request({
  title: "Request Title",
  description: "Optional description",
  fields: [
    { kind: "form", key: "input", schema: {...}, defaults: {...} },
    { kind: "question", key: "choice", questions: [...] },
    { kind: "select_rows", key: "selected", columns: [...], data: [...], selectionMode: "multiple" },
    { kind: "confirm", key: "confirmed", confirmLabel: "Yes", rejectLabel: "No", variant: "danger" }
  ]
})
\`\`\`

**Field kinds:**
| Kind | Purpose | Key Params |
|------|---------|------------|
| form | Collect structured data | schema (JSON Schema), defaults |
| question | Ask questions with options | questions: [{question, header, options, multiSelect}] |
| select_rows | Select from table | columns, data, selectionMode (single/multiple) |
| confirm | Yes/No confirmation | confirmLabel, rejectLabel, variant (info/warning/danger) |
`

const PARENT_SYSTEM_INSTRUCTIONS = `
## System Tools

You have access to system tools for output, user input, and task completion.

### Output Tools (display only, non-blocking)

Use these to display information to the user. They do NOT pause execution.

| Tool | Purpose | Key Params |
|------|---------|------------|
| output_table | Display data table | columns, data, name |
| output_chart | Display chart | type (line/bar/pie), data, name |
| output_markdown | Display markdown | content, name |
| output_key_value | Display key-value pairs | pairs, name |

${HUMAN_REQUEST_INSTRUCTIONS}

### Completion Tool

| Tool | Purpose | Key Params |
|------|---------|------------|
| task_complete | Mark task as done | summary |

**Summary Guidelines:**
- State WHAT was done, not raw data (e.g., "Displayed sales chart" not chart values)
- Reference displayed outputs (e.g., "See the chart above")
- Keep to 1-3 bullet points
- Only include info NOT visible elsewhere

### Decision Flow

1. **Task fulfilled?** → \`task_complete\`
2. **Need user input?** → Use \`human_request\`
3. **Display data then complete?** → Use \`output_*\` tool → \`task_complete\`

**NEVER return plain text to ask questions.** Use \`human_request\` with question or form fields.
`

const SUBAGENT_SYSTEM_INSTRUCTIONS = `
## System Tools

You have access to system tools for user input and returning results.

${HUMAN_REQUEST_INSTRUCTIONS}

### Completion Tool

| Tool | Purpose | Key Params |
|------|---------|------------|
| return_to_parent | Return result to parent agent | result (object), summary |

When your task is complete, call \`return_to_parent\` with structured result data.

**NEVER return plain text to ask questions.** Use \`human_request\` with question or form fields.
`

function buildDelegationInstructions(subagents: SubagentConfig[]): string {
  if (subagents.length === 0) return ""

  const toolList = subagents.map((s) => `- \`delegate_to_${s.alias}\`: ${s.description}`).join("\n")

  return `

## Subagents

${toolList}
`
}

export async function callLLM(input: CallLLMInput): Promise<CallLLMResult> {
  const { agentConfig, messages, timeoutMs, depth = 0, subagents = [], llmConfig } = input
  const start = Date.now()

  const model = getModel(agentConfig.model.provider, agentConfig.model.model, llmConfig)
  const tools = buildTools(agentConfig, depth, subagents)
  const aiMessages = convertMessages(messages)
  const delegationInstructions = buildDelegationInstructions(subagents)
  const systemInstructions = depth === 0 ? PARENT_SYSTEM_INSTRUCTIONS : SUBAGENT_SYSTEM_INSTRUCTIONS
  const systemPrompt = agentConfig.systemPrompt + "\n" + systemInstructions + delegationInstructions

  const shouldTimeout = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
  const abortController = shouldTimeout ? new AbortController() : undefined
  const timeoutId = shouldTimeout ? setTimeout(() => abortController?.abort(), timeoutMs) : undefined

  try {
    const response = await generateText({
      model,
      system: systemPrompt,
      messages: aiMessages,
      tools,
      toolChoice: "auto",
      temperature: agentConfig.model.temperature,
      topP: agentConfig.model.topP,
      providerOptions: buildProviderOptions(agentConfig.model),
      abortSignal: abortController?.signal,
    })

    const durationMs = Date.now() - start

    const usage =
      response.usage && response.usage.inputTokens !== undefined && response.usage.outputTokens !== undefined
        ? { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
        : undefined

    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCalls: ToolCallRecord[] = response.toolCalls.map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        params: tc.input as Record<string, unknown>,
      }))

      return {
        type: "tool_calls",
        toolCalls,
        rawResponse: response,
        durationMs,
        usage,
      }
    }

    return {
      type: "text",
      content: response.text,
      rawResponse: response,
      durationMs,
      usage,
    }
  } catch (err) {
    const durationMs = Date.now() - start
    const name = err instanceof Error ? err.name : undefined
    const aborted = abortController?.signal.aborted || name === "AbortError" || name === "TimeoutError"

    if (aborted) {
      const reason = shouldTimeout ? "timeout" : "abort"
      const error = reason === "timeout" ? "LLM request timed out" : "LLM request aborted"
      return { type: "error", reason, error, durationMs }
    }

    throw err
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function getModel(provider: ModelProvider, modelName: string, llmConfig: ResolvedLlmConfig) {
  const providers = {
    openai: createOpenAI,
    anthropic: createAnthropic,
    google: createGoogleGenerativeAI,
  } as const

  const create = providers[provider]
  if (!create) throw new Error(`Unsupported model provider: ${provider}`)

  return create({ apiKey: llmConfig.apiKey, baseURL: llmConfig.baseUrl ?? undefined })(modelName)
}

type ProviderOptions = Record<string, Record<string, JSONValue>>

function buildProviderOptions(config: AgentModelConfig): ProviderOptions | undefined {
  if (!config.reasoning) return undefined
  const r = config.reasoning

  if (config.provider === "openai" && r.effort) {
    return { openai: { reasoningEffort: r.effort } }
  }
  if (config.provider === "anthropic" && r.budgetTokens) {
    return { anthropic: { thinking: { type: "enabled", budgetTokens: r.budgetTokens } } }
  }
  if (config.provider === "google") {
    if (r.level) return { google: { thinkingConfig: { thinkingLevel: r.level, includeThoughts: false } } }
    if (r.budget) return { google: { thinkingConfig: { thinkingBudget: r.budget, includeThoughts: false } } }
  }
  return undefined
}

function resolveSchema(
  schema: Record<string, unknown>,
  defs: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return schema

  if (schema.$ref && typeof schema.$ref === "string") {
    const match = (schema.$ref as string).match(/^#\/\$defs\/(.+)$/)
    if (match && defs) {
      const resolved = defs[match[1]] as Record<string, unknown> | undefined
      if (resolved) {
        return resolveSchema(structuredClone(resolved), defs)
      }
    }
    return schema
  }

  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged: Record<string, unknown> = { type: "object" }
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const item of schema.allOf as Record<string, unknown>[]) {
      const resolved = resolveSchema(structuredClone(item), defs)
      if (resolved.properties && typeof resolved.properties === "object") {
        Object.assign(properties, resolved.properties)
      }
      if (Array.isArray(resolved.required)) {
        required.push(...(resolved.required as string[]))
      }
    }

    merged.properties = properties
    if (required.length > 0) {
      merged.required = [...new Set(required)]
    }
    return merged
  }

  if (schema.properties && typeof schema.properties === "object") {
    const resolved = structuredClone(schema) as Record<string, unknown>
    const props = resolved.properties as Record<string, unknown>
    for (const key of Object.keys(props)) {
      props[key] = resolveSchema(props[key] as Record<string, unknown>, defs)
    }
    return resolved
  }

  if (schema.items && typeof schema.items === "object") {
    const resolved = structuredClone(schema) as Record<string, unknown>
    resolved.items = resolveSchema(schema.items as Record<string, unknown>, defs)
    return resolved
  }

  return schema
}

function buildTools(agentConfig: AgentRuntimeConfig, depth: number, subagents: SubagentConfig[]) {
  const tools: Record<string, ReturnType<typeof tool>> = {}
  const defs = agentConfig.$defs as Record<string, unknown> | undefined

  for (const t of agentConfig.tools) {
    const rawSchema = structuredClone(t.params) as Record<string, unknown>
    const resolved = resolveSchema(rawSchema, defs)
    const schema = resolved as JSONSchema7 & {
      properties?: Record<string, unknown>
      required?: string[]
    }
    if (!schema.type) {
      schema.type = "object"
    }
    if (!schema.properties) {
      schema.properties = {}
    }

    if (t.requiresReview) {
      schema.properties = schema.properties ?? {}
      schema.properties["__rationale"] = {
        type: "string",
        description:
          "Detailed reasoning for this action, formatted in GitHub Flavored Markdown (GFM). Explain: (1) why this action is necessary, (2) specific evidence from the conversation supporting this decision, and (3) expected outcome. Use bullet points or numbered lists for clarity.",
      }
      schema.required = schema.required ?? []
      schema.required.push("__rationale")
    }

    tools[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(schema),
    })
  }

  const systemTools = getSystemTools(depth, 1, subagents)
  for (const st of systemTools) {
    tools[st.name] = tool({
      description: st.description,
      inputSchema: jsonSchema(st.params as JSONSchema7),
    })
  }

  return tools
}

function convertMessages(messages: ConversationMessage[]): ModelMessage[] {
  const result: ModelMessage[] = []

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content })
    } else if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: "assistant",
          content: [
            ...(msg.content ? [{ type: "text" as const, text: msg.content }] : []),
            ...msg.toolCalls.map((tc) => ({
              type: "tool-call" as const,
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.params,
            })),
          ],
        })
      } else {
        result.push({ role: "assistant", content: msg.content })
      }
    } else if (msg.role === "tool") {
      let output: ToolResultPart["output"]
      if (!msg.result) {
        output = { type: "text", value: "" }
      } else {
        try {
          const parsed = JSON.parse(msg.result)
          output = { type: "json", value: parsed ?? {} }
        } catch {
          output = { type: "text", value: msg.result }
        }
      }
      result.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: msg.toolCallId,
            toolName: msg.toolName,
            output,
          },
        ],
      })
    }
  }

  return result
}
