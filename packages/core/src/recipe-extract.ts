import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { withDb, first } from "./database"
import { MessageTable } from "./schema/message.sql"
import { RunTable } from "./schema/run.sql"
import { ThreadTable } from "./schema/thread.sql"
import { AgentReleaseTable, AgentWorkingCopyTable } from "./schema/agent.sql"
import { createError } from "@synatra/util/error"
import { principal } from "./principal"
import { COMPUTE_TOOLS, OUTPUT_TOOLS, HUMAN_TOOLS } from "./system-tools"
import { buildExtractionPromptV2, buildRetryPrompt } from "./recipe-extract-prompt"
import type {
  RecipeInput,
  RecipeOutput,
  ParamBinding,
  AgentTool,
  QueryStepConfig,
  CodeStepConfig,
  OutputStepConfig,
  InputStepConfig,
  OutputStepKind,
} from "./types"

const SAMPLE_LIMIT = 3
const STRING_LIMIT = 200
const DEPTH_LIMIT = 4

export function sampleValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "string") {
    return value.length > STRING_LIMIT ? value.slice(0, STRING_LIMIT) + "..." : value
  }
  if (depth > DEPTH_LIMIT) return "[truncated]"
  if (Array.isArray(value)) {
    const sampled = value.slice(0, SAMPLE_LIMIT).map((v) => sampleValue(v, depth + 1))
    if (value.length > SAMPLE_LIMIT) {
      return [...sampled, `... and ${value.length - SAMPLE_LIMIT} more items`]
    }
    return sampled
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = sampleValue(v, depth + 1)
    }
    return result
  }
  return value
}

export interface ConversationContext {
  threadId: string
  runId: string
  agentId: string
  agentTools: AgentTool[]
  messages: ExtractedMessage[]
}

export interface ExtractedMessage {
  id: string
  runId: string | null
  type: "user" | "assistant" | "tool_call" | "tool_result" | "system" | "error"
  content: string | null
  toolCall: { id: string; name: string; params: Record<string, unknown> } | null
  toolResult: { toolCallId: string; result: unknown; error?: string } | null
  createdAt: Date
}

export interface ToolCallPair {
  toolCall: ExtractedMessage
  toolResult: ExtractedMessage
}

export const LoadConversationContextSchema = z.object({
  threadId: z.string(),
  runId: z.string(),
})

export async function loadConversationContext(
  raw: z.input<typeof LoadConversationContextSchema>,
): Promise<ConversationContext> {
  const input = LoadConversationContextSchema.parse(raw)
  const organizationId = principal.orgId()

  const thread = await withDb((db) =>
    db
      .select()
      .from(ThreadTable)
      .where(and(eq(ThreadTable.id, input.threadId), eq(ThreadTable.organizationId, organizationId)))
      .then(first),
  )

  if (!thread) {
    throw createError("NotFoundError", { type: "Thread", id: input.threadId })
  }

  const run = await withDb((db) =>
    db
      .select()
      .from(RunTable)
      .where(and(eq(RunTable.id, input.runId), eq(RunTable.threadId, input.threadId)))
      .then(first),
  )

  if (!run) {
    throw createError("NotFoundError", { type: "Run", id: input.runId })
  }

  if (run.status !== "completed") {
    throw createError("BadRequestError", { message: "Run must be completed to extract recipe" })
  }

  let agentTools: AgentTool[] = []

  if (thread.agentReleaseId) {
    const release = await withDb((db) =>
      db.select().from(AgentReleaseTable).where(eq(AgentReleaseTable.id, thread.agentReleaseId!)).then(first),
    )
    if (release) {
      agentTools = release.runtimeConfig.tools ?? []
    }
  } else {
    const workingCopy = await withDb((db) =>
      db.select().from(AgentWorkingCopyTable).where(eq(AgentWorkingCopyTable.agentId, thread.agentId)).then(first),
    )
    if (workingCopy) {
      agentTools = workingCopy.runtimeConfig.tools ?? []
    }
  }

  const messages = await withDb((db) =>
    db
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.threadId, input.threadId))
      .orderBy(MessageTable.createdAt, MessageTable.id),
  )

  const runMessages = messages.filter((m) => m.runId === input.runId)

  return {
    threadId: input.threadId,
    runId: input.runId,
    agentId: thread.agentId,
    agentTools,
    messages: runMessages.map((m) => ({
      id: m.id,
      runId: m.runId,
      type: m.type,
      content: m.content,
      toolCall: m.toolCall as ExtractedMessage["toolCall"],
      toolResult: m.toolResult as ExtractedMessage["toolResult"],
      createdAt: m.createdAt,
    })),
  }
}

export function extractToolCallPairs(messages: ExtractedMessage[]): ToolCallPair[] {
  const pairs: ToolCallPair[] = []
  const toolCallMap = new Map<string, ExtractedMessage>()

  for (const msg of messages) {
    if (msg.type === "tool_call" && msg.toolCall) {
      toolCallMap.set(msg.toolCall.id, msg)
    }
    if (msg.type === "tool_result" && msg.toolResult) {
      const toolCall = toolCallMap.get(msg.toolResult.toolCallId)
      if (toolCall) {
        pairs.push({ toolCall, toolResult: msg })
      }
    }
  }

  return pairs
}

export function extractAssistantMessages(messages: ExtractedMessage[]): ExtractedMessage[] {
  return messages.filter((m) => m.type === "assistant" && m.content)
}

export interface ExtractedRecipe {
  inputs: RecipeInput[]
  steps: ExtractedStep[]
  outputs: RecipeOutput[]
}

export function validateRecipeSteps(
  steps: ExtractedStep[],
  inputs: RecipeInput[] = [],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const inputKeys = new Set(inputs.map((i) => i.key))
  const precedingKeys = new Set<string>()

  function validateBinding(binding: ParamBinding, stepKey: string, paramPath: string): void {
    switch (binding.type) {
      case "ref":
        if (binding.scope === "step" && !precedingKeys.has(binding.key)) {
          errors.push(
            `Step "${stepKey}" param "${paramPath}" references "${binding.key}" which is not a preceding step`,
          )
        }
        if (binding.scope === "input" && !inputKeys.has(binding.key)) {
          errors.push(`Step "${stepKey}" param "${paramPath}" references non-existent input "${binding.key}"`)
        }
        break
      case "template":
        for (const [index, part] of binding.parts.entries()) {
          if (typeof part !== "string") {
            validateBinding(part, stepKey, `${paramPath}.parts[${index}]`)
          }
        }
        break
      case "object":
        for (const [key, entryBinding] of Object.entries(binding.entries)) {
          validateBinding(entryBinding, stepKey, `${paramPath}.entries.${key}`)
        }
        break
      case "array":
        binding.items.forEach((item, idx) => {
          validateBinding(item, stepKey, `${paramPath}.items[${idx}]`)
        })
        break
    }
  }

  for (const step of steps) {
    if (step.type === "query" || step.type === "code" || step.type === "output") {
      validateBinding(step.config.binding, step.stepKey, "binding")
    }

    if (step.type === "input") {
      for (const field of step.config.fields) {
        if (field.kind === "select_rows") {
          validateBinding(field.data, step.stepKey, `fields.${field.key}.data`)
        }
        if (field.kind === "form" && field.defaults) {
          validateBinding(field.defaults, step.stepKey, `fields.${field.key}.defaults`)
        }
      }
    }

    precedingKeys.add(step.stepKey)
  }

  return { valid: errors.length === 0, errors }
}

function formatToolSection(name: string, description: string, params: unknown, returns?: unknown): string {
  const lines = [
    `### ${name}`,
    description,
    "",
    "**Parameters:**",
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    "",
  ]
  if (returns) {
    lines.push("**Returns:**", "```json", JSON.stringify(returns, null, 2), "```", "")
  }
  return lines.join("\n")
}

export function formatToolSchemas(agentTools: AgentTool[]): string {
  const agentToolLines = agentTools.map((t) => formatToolSection(t.name, t.description, t.params, t.returns))
  const systemTools = [...COMPUTE_TOOLS, ...OUTPUT_TOOLS, ...HUMAN_TOOLS]
  const systemToolLines = systemTools.map((t) => formatToolSection(t.name, t.description, t.params, t.returns))

  return [
    "# Available Tools",
    "",
    "## Agent Tools",
    "",
    ...(agentToolLines.length > 0 ? agentToolLines : ["(No agent tools available)"]),
    "",
    "## System Tools (for Recipe)",
    "",
    ...systemToolLines,
  ].join("\n")
}

function formatMessage(msg: ExtractedMessage): string[] {
  if (msg.type === "user") return ["## User Message", msg.content ?? "", ""]
  if (msg.type === "assistant" && msg.content) return ["## Assistant Response", msg.content, ""]
  if (msg.type === "tool_call" && msg.toolCall) {
    return [`## Tool Call: ${msg.toolCall.name}`, "```json", JSON.stringify(msg.toolCall.params, null, 2), "```", ""]
  }
  if (msg.type === "tool_result" && msg.toolResult) {
    if (msg.toolResult.error) return ["## Tool Result (Error)", `Error: ${msg.toolResult.error}`, ""]
    return ["## Tool Result", "```json", JSON.stringify(sampleValue(msg.toolResult.result), null, 2), "```", ""]
  }
  return []
}

export function formatConversationForLLM(context: ConversationContext): string {
  return ["# Conversation Log", "", ...context.messages.flatMap(formatMessage)].join("\n")
}

export const RECIPE_EXTRACTION_PROMPT = `You are a recipe extraction assistant. Your goal is to create a generalized, reusable workflow from a conversation log.

IMPORTANT: The conversation is just ONE example use case. Your recipe should be flexible enough for future runs with different data.

Generalization principles:
- Parameterize magic values - Concrete values in the conversation (IDs, names, dates) are magic values; define them in inputs array AND reference them using a ref binding with scope=input.
- Don't hardcode data values - Use ref bindings to pass data from previous steps.
- Let tools determine output structure - If a query returns columns, display ALL returned columns, not just the ones shown in this conversation.
- Derive display data from source - Chart labels/values, table columns should come from actual query results.
- Analyze tool capabilities - Understand what each tool can return and build flexible data flows.
- Every step must be consumed - A step is only valid if its output is either: (1) used by another step via ref binding, or (2) displayed as a final output. If a step's result isn't referenced anywhere, EXCLUDE it.

Your task:
1. Identify the user's INTENT (not just the specific actions)
2. Design data flow that works with varying data
3. Use bindings to connect steps dynamically
4. Make outputs adapt to the actual data returned

---

## Output Format

{
  "name": "Recipe name",
  "description": "What this recipe does",
  "inputs": [{ "key": "user_id", "label": "User ID", "type": "string", "description": "Target user to analyze", "required": true, "defaultValue": "123" }],
  "steps": [{ "stepKey": "snake_case_key", "label": "Human readable", "toolName": "tool", "params": { ... } }],
  "outputs": [{ "stepId": "output_step_key", "kind": "table" }]
}

IMPORTANT: Steps are executed in array order. Each step can only reference previous steps via bindings.

Input types: "string" | "number"
Output kinds: "table" | "chart" | "markdown" | "key_value"

---

## ParamBinding Reference

Each parameter in a step uses a ParamBinding to determine its value at runtime.

Valid binding types: literal | ref | template | object | array

Note: code_execute is a STEP toolName, NOT a binding type. If you need data transformation, create a code_execute step and reference its result with a ref binding.

### Choosing the Right Binding Type

Is the value always the same?
- YES → literal
- NO → Should user provide it each run?
  - YES → ref (scope=input)
  - NO → Does it come from a previous step?
    - YES → Can you get it with a simple path?
      - YES → ref (scope=step, with optional path)
      - NO (needs filter/map/logic) → Create a code_execute STEP, then ref to its output
    - NO → Are you combining multiple values?
      - Into a string → template
      - Into an object → object
      - Into an array → array

### literal - Fixed values

Use for: Constants, SQL queries, configuration values
Example: { "type": "literal", "value": "SELECT * FROM users WHERE active = true" }

### ref - Input or step output

Use for: Inputs and previous step outputs
Example input: { "type": "ref", "scope": "input", "key": "user_id" }
Example step: { "type": "ref", "scope": "step", "key": "fetch_users", "path": ["data", 0, "id"] }

### template - Build a string

Use for: Strings that combine multiple values
Example: { "type": "template", "parts": ["User ", { "type": "ref", "scope": "input", "key": "user_id" }] }

### object - Build an object

Use for: Structured inputs
Example: { "type": "object", "entries": { "userId": { "type": "ref", "scope": "input", "key": "user_id" } } }

### array - Build an array

Use for: Ordered lists
Example: { "type": "array", "items": [{ "type": "ref", "scope": "step", "key": "fetch_users" }] }
`

export function buildRecipeExtractionPrompt(context: ConversationContext): string {
  return buildExtractionPromptV2(
    context.agentTools,
    context.messages.map((m) => ({
      type: m.type,
      content: m.content,
      toolCall: m.toolCall,
      toolResult: m.toolResult,
    })),
    sampleValue,
  )
}

export function buildRecipeExtractionPromptLegacy(context: ConversationContext): string {
  const toolSchemas = formatToolSchemas(context.agentTools)
  const conversationLog = formatConversationForLLM(context)
  return `${RECIPE_EXTRACTION_PROMPT}

---

${toolSchemas}

---

${conversationLog}

---

Extract the recipe from the above conversation log. Return only the JSON object.`
}

export function buildValidationRetryPrompt(errors: string[]): string {
  return buildRetryPrompt(errors)
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

export interface RawStep {
  stepKey: string
  label: string
  toolName: string
  params: Record<string, ParamBinding>
}

export type ExtractedStep = {
  stepKey: string
  label: string
} & (
  | { type: "query"; config: QueryStepConfig }
  | { type: "code"; config: CodeStepConfig }
  | { type: "output"; config: OutputStepConfig }
  | { type: "input"; config: InputStepConfig }
)

export interface NormalizeStepsResult {
  steps: ExtractedStep[]
  keyMap: Map<string, string>
  errors: string[]
}

const OUTPUT_KIND_MAP: Record<string, OutputStepKind> = {
  output_table: "table",
  output_chart: "chart",
  output_markdown: "markdown",
  output_key_value: "key_value",
}

function convertRawStepToExtractedStep(
  step: RawStep & { stepKey: string },
  keyMap: Map<string, string>,
  agentTools: AgentTool[],
): ExtractedStep {
  const { stepKey, label, toolName, params } = step
  const normalizedParams = updateParamBindingRefs(params, keyMap)

  if (toolName in OUTPUT_KIND_MAP) {
    const kind = OUTPUT_KIND_MAP[toolName]
    return {
      stepKey,
      label,
      type: "output",
      config: {
        kind,
        binding: { type: "object", entries: normalizedParams },
      },
    }
  }

  if (toolName === "human_request") {
    const titleBinding = normalizedParams.title
    const descBinding = normalizedParams.description
    const fieldsBinding = normalizedParams.fields

    const title = titleBinding?.type === "literal" ? String(titleBinding.value) : "User Input"
    const description = descBinding?.type === "literal" ? String(descBinding.value) : undefined
    const fields =
      fieldsBinding?.type === "literal" && Array.isArray(fieldsBinding.value)
        ? (fieldsBinding.value as Array<Record<string, unknown>>)
        : []

    const convertedFields = fields.map((f) => {
      if (f.kind === "select_rows") {
        const dataValue = f.data ?? f.dataBinding
        const isBinding =
          dataValue &&
          typeof dataValue === "object" &&
          "type" in dataValue &&
          ["literal", "ref", "template", "object", "array"].includes((dataValue as { type: string }).type)
        const data: ParamBinding = isBinding
          ? updateBindingRef(dataValue as ParamBinding, keyMap)
          : { type: "literal" as const, value: dataValue ?? [] }

        return {
          kind: "select_rows" as const,
          key: String(f.key ?? "selection"),
          columns: (f.columns as Array<{ key: string; label: string }>) ?? [],
          data,
          selectionMode: (f.selectionMode as "single" | "multiple") ?? "multiple",
        }
      }
      if (f.kind === "form") {
        const defaultsValue = f.defaults ?? f.defaultsBinding
        const isBinding =
          defaultsValue &&
          typeof defaultsValue === "object" &&
          "type" in defaultsValue &&
          ["literal", "ref", "template", "object", "array"].includes((defaultsValue as { type: string }).type)
        const defaults: ParamBinding | undefined = isBinding
          ? updateBindingRef(defaultsValue as ParamBinding, keyMap)
          : defaultsValue
            ? { type: "literal" as const, value: defaultsValue }
            : undefined

        return {
          kind: "form" as const,
          key: String(f.key ?? "form"),
          schema: (f.schema as Record<string, unknown>) ?? {},
          defaults,
        }
      }
      if (f.kind === "question") {
        return {
          kind: "question" as const,
          key: String(f.key ?? "question"),
          questions:
            (f.questions as Array<{
              question: string
              header: string
              options: Array<{ label: string; description: string }>
              multiSelect?: boolean
            }>) ?? [],
        }
      }
      return {
        kind: "form" as const,
        key: String(f.key ?? "field"),
        schema: {},
      }
    })

    return {
      stepKey,
      label,
      type: "input",
      config: {
        title,
        description,
        fields: convertedFields as InputStepConfig["fields"],
      },
    }
  }

  if (toolName === "code_execute") {
    const codeBinding = normalizedParams.code
    const inputBinding = normalizedParams.input
    const timeoutBinding = normalizedParams.timeout
    const code = codeBinding?.type === "literal" ? String(codeBinding.value) : ""
    const binding = inputBinding ?? { type: "object" as const, entries: {} }
    const timeoutMs = timeoutBinding?.type === "literal" ? Number(timeoutBinding.value) : undefined

    return {
      stepKey,
      label,
      type: "code",
      config: {
        code,
        timeoutMs,
        binding,
      },
    }
  }

  const agentTool = agentTools.find((t) => t.name === toolName)
  if (agentTool) {
    return {
      stepKey,
      label,
      type: "query",
      config: {
        description: agentTool.description,
        params: agentTool.params as Record<string, unknown>,
        returns: agentTool.returns as Record<string, unknown>,
        code: agentTool.code,
        timeoutMs: agentTool.timeoutMs,
        binding: { type: "object", entries: normalizedParams },
      },
    }
  }

  return {
    stepKey,
    label,
    type: "query",
    config: {
      description: `Unknown tool: ${toolName}`,
      params: {},
      returns: {},
      code: `throw new Error("Unknown tool: ${toolName}")`,
      binding: { type: "object", entries: normalizedParams },
    },
  }
}

export function normalizeStepKeys(steps: RawStep[], agentTools: AgentTool[] = []): NormalizeStepsResult {
  const keyMap = new Map<string, string>()
  const usedKeys = new Set<string>()
  const errors: string[] = []

  const normalizedSteps = steps.map((step, index) => {
    const originalKey = step.stepKey
    const normalizedKey = toSnakeCase(step.stepKey) || `step_${index}`

    if (usedKeys.has(normalizedKey)) {
      errors.push(`Duplicate step key "${normalizedKey}" (from "${originalKey}")`)
    }

    usedKeys.add(normalizedKey)
    keyMap.set(originalKey, normalizedKey)

    return { ...step, stepKey: normalizedKey }
  })

  return {
    steps: normalizedSteps.map((step) => convertRawStepToExtractedStep(step, keyMap, agentTools)),
    keyMap,
    errors,
  }
}

export function updateParamBindingRefs(
  params: Record<string, ParamBinding>,
  idMap: Map<string, string>,
): Record<string, ParamBinding> {
  return Object.fromEntries(Object.entries(params).map(([key, binding]) => [key, updateBindingRef(binding, idMap)]))
}

export function updateBindingRef(binding: ParamBinding, idMap: Map<string, string>): ParamBinding {
  if (binding.type === "ref" && binding.scope === "step") {
    return { ...binding, key: idMap.get(binding.key) ?? binding.key }
  }
  if (binding.type === "template") {
    return {
      ...binding,
      parts: binding.parts.map((part) => (typeof part === "string" ? part : updateBindingRef(part, idMap))),
    }
  }
  if (binding.type === "object") {
    return { ...binding, entries: updateParamBindingRefs(binding.entries, idMap) }
  }
  if (binding.type === "array") {
    return { ...binding, items: binding.items.map((item) => updateBindingRef(item, idMap)) }
  }
  return binding
}
