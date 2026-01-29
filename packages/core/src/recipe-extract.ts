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
import type { RecipeInput, RecipeOutput, ParamBinding, AgentTool } from "./types"

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

export function validateRecipeSteps(steps: ExtractedStep[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const stepKeys = new Set(steps.map((s) => s.stepKey))
  const stepMap = new Map(steps.map((s) => [s.stepKey, s]))

  for (const step of steps) {
    for (const depKey of step.dependsOn) {
      if (!stepKeys.has(depKey)) {
        errors.push(`Step "${step.stepKey}" depends on non-existent step "${depKey}"`)
      }
    }

    for (const [paramName, binding] of Object.entries(step.params)) {
      if (binding.type === "step" && !stepKeys.has(binding.stepId)) {
        errors.push(`Step "${step.stepKey}" param "${paramName}" references non-existent step "${binding.stepId}"`)
      }
    }

    if (step.toolName === "human_request") {
      const fieldsBinding = step.params.fields
      if (fieldsBinding?.type === "static" && Array.isArray(fieldsBinding.value)) {
        const fields = fieldsBinding.value as Array<{ kind: string }>
        const unsupported = fields.filter((f) => f.kind === "confirm" || f.kind === "approval")
        if (unsupported.length > 0) {
          const kinds = [...new Set(unsupported.map((f) => f.kind))].join(", ")
          errors.push(`Step "${step.stepKey}" uses unsupported field kinds: ${kinds}`)
        }
      }
    }
  }

  const visited = new Set<string>()
  const visiting = new Set<string>()

  function hasCycle(stepKey: string): boolean {
    if (visiting.has(stepKey)) return true
    if (visited.has(stepKey)) return false

    visiting.add(stepKey)
    const step = stepMap.get(stepKey)
    if (step) {
      for (const depKey of step.dependsOn) {
        if (hasCycle(depKey)) return true
      }
    }
    visiting.delete(stepKey)
    visited.add(stepKey)
    return false
  }

  for (const step of steps) {
    if (hasCycle(step.stepKey)) {
      errors.push(`Circular dependency detected involving step "${step.stepKey}"`)
      break
    }
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
    ...agentToolLines,
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

export const RECIPE_EXTRACTION_PROMPT = `You are a recipe extraction assistant. Your goal is to create a **generalized, reusable workflow** from a conversation log.

IMPORTANT: The conversation is just ONE example use case. Your recipe should be flexible enough for future runs with different data.

Generalization principles:
- **Parameterize magic values** - Concrete values in the conversation (IDs, names, dates) are magic numbers; define them in inputs array AND reference them in step params using { "type": "input", "inputKey": "..." } bindings. Set defaultValue unless the user must always provide their own value based on the task intent
- **Don't hardcode data values** - Use bindings to pass data from previous steps
- **Let tools determine output structure** - If a query returns columns, display ALL returned columns, not just the ones shown in this conversation
- **Derive display data from source** - Chart labels/values, table columns should come from actual query results
- **Analyze tool capabilities** - Understand what each tool can return and build flexible data flows
- **Exclude one-time analysis** - If LLM generated analysis text specific to the conversation data (e.g., "User X is top performer with 36% advantage"), EXCLUDE that output_markdown step entirely. Such analysis won't be valid when data changes. Only include markdown steps if they have a reusable structure (e.g., simple status messages, formatted data summaries using template bindings)

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
  "steps": [{ "stepKey": "snake_case_key", "label": "Human readable", "toolName": "tool", "params": { ... }, "dependsOn": [] }],
  "outputs": [{ "stepId": "output_step_key", "kind": "table" }]
}

Input types: "string" | "number" | "date" | "dateRange" | "select"
Output kinds: "table" | "chart" | "markdown" | "key_value"

---

## ParamBinding Reference

Each parameter in a step uses a ParamBinding to determine its value at runtime.

**Valid binding types: static | input | step | template | object | array**

Note: code_execute is a STEP toolName, NOT a binding type. If you need data transformation, create a code_execute step and reference its result with a step binding.

### Choosing the Right Binding Type

\`\`\`
Is the value always the same?
├─ YES → static
└─ NO → Should user provide it each run?
         ├─ YES → input
         └─ NO → Does it come from a previous step?
                  ├─ YES → Can you get it with a simple path?
                  │         ├─ YES → step (with optional path)
                  │         └─ NO (needs filter/map/logic) → Create a code_execute STEP, then use step binding
                  └─ NO → Are you combining multiple values?
                           ├─ Into a string → template
                           ├─ Into an object → object
                           └─ Into an array → array
\`\`\`

### 1. static - Fixed values

Use for: Constants, SQL queries, configuration values
{ "type": "static", "value": any }

Example:
{ "type": "static", "value": "SELECT * FROM users WHERE active = true" }

### 2. input - User-provided values

Use for: Values that change each time the recipe runs. First define the input in the "inputs" array, then reference it here.
{ "type": "input", "inputKey": "string" }

Example:
If inputs array contains { "key": "user_id", ... }, reference it as:
{ "type": "input", "inputKey": "user_id" }

### 3. step - Previous step results

Use for: Passing data from one step to another
{ "type": "step", "stepId": "string", "path": "$.jsonpath" (optional) }

Path examples:
- Whole result: { "type": "step", "stepId": "fetch_users" }
- Nested field: { "type": "step", "stepId": "fetch_users", "path": "$.data[0].email" }
- Map array: { "type": "step", "stepId": "fetch_users", "path": "$[*].id" }

### 4. template - String interpolation

Use for: Building strings from multiple dynamic values (markdown output, messages, file paths)
{ "type": "template", "template": "string with {{var}}", "variables": { "var": ParamBinding } }

The {{varName}} placeholders are replaced with resolved variable values.

Example - output_markdown with dynamic content (common pattern):
{
  "stepKey": "show_report",
  "label": "Display user report",
  "toolName": "output_markdown",
  "params": {
    "content": {
      "type": "template",
      "template": "# Report for {{userName}}\\n\\n**Total Orders:** {{orderCount}}\\n**Revenue:** {{revenue}} USD\\n\\n{{summary}}",
      "variables": {
        "userName": { "type": "input", "inputKey": "user_name" },
        "orderCount": { "type": "step", "stepId": "fetch_stats", "path": "$.orderCount" },
        "revenue": { "type": "step", "stepId": "fetch_stats", "path": "$.totalRevenue" },
        "summary": { "type": "step", "stepId": "generate_summary" }
      }
    }
  },
  "dependsOn": ["fetch_stats", "generate_summary"]
}

Example - Dynamic file path:
{
  "type": "template",
  "template": "/reports/{{year}}/{{month}}/summary.csv",
  "variables": {
    "year": { "type": "input", "inputKey": "year" },
    "month": { "type": "input", "inputKey": "month" }
  }
}

### 5. object - Construct objects

Use for: Building objects from multiple bindings, wrapping data for code_execute
{ "type": "object", "entries": { "key": ParamBinding } }

Example - Combining data from multiple sources:
{
  "type": "object",
  "entries": {
    "userId": { "type": "input", "inputKey": "user_id" },
    "orders": { "type": "step", "stepId": "fetch_orders" },
    "timestamp": { "type": "static", "value": "2024-01-01" }
  }
}

### 6. array - Construct arrays

Use for: Building arrays from multiple bindings (e.g., SQL parameters)
{ "type": "array", "items": [ParamBinding, ...] }

Example - SQL parameters:
{
  "type": "array",
  "items": [
    { "type": "input", "inputKey": "name" },
    { "type": "input", "inputKey": "email" }
  ]
}

---

## code_execute - Data Transformation

Use code_execute when you need transformations that bindings cannot express:
- Filtering: \`input.items.filter(x => x.active)\`
- Mapping with logic: \`input.items.map(x => ({ ...x, total: x.price * x.qty }))\`
- Conditional: \`input.count > 0 ? input.items[0] : null\`
- Aggregation: \`input.items.reduce((sum, x) => sum + x.amount, 0)\`

IMPORTANT: The input parameter MUST be an object. Wrap arrays using object binding:

{
  "stepKey": "filter_active",
  "label": "Filter active users",
  "toolName": "code_execute",
  "params": {
    "code": { "type": "static", "value": "return input.users.filter(u => u.active)" },
    "input": {
      "type": "object",
      "entries": {
        "users": { "type": "step", "stepId": "fetch_users" }
      }
    }
  },
  "dependsOn": ["fetch_users"]
}

---

## System Tools

Include as steps:
- output_table, output_chart, output_markdown, output_key_value: Display results to user
- human_request: Pause for user input (form/question/select_rows only)

Do NOT include:
- task_complete: Recipe completes automatically after last step
- human_request with confirm/approval fields: These are for one-time conversational decisions, not reusable recipes

---

## Step Design

**stepKey**: Unique snake_case identifier describing purpose
- Good: "fetch_active_users", "calculate_total", "send_email"
- Bad: "step_0", "step_1", "s1"

**label**: Human-readable description for UI
- Good: "Fetch active users", "Calculate order total"

**dependsOn**: List stepKeys that must complete before this step
- Must reference existing stepKeys
- No circular dependencies allowed

---

## Extraction Process

1. **Understand user intent** - What is the user trying to accomplish? (not just what they did)
2. **Analyze tool capabilities** - What can each tool return? What columns/fields are available?
3. **Design flexible data flow** - Connect steps with bindings so data flows dynamically
4. **Generalize outputs** - Display all relevant data from previous steps, not just what was shown in this conversation
5. **Avoid hardcoding** - If a value came from a previous step, use a binding to get it
6. **Verify references** - Ensure all step references exist and no circular dependencies

Remember: This conversation is ONE example. The recipe should work when the underlying data changes.
`

export function buildRecipeExtractionPrompt(context: ConversationContext): string {
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
  dependsOn: string[]
}

export interface ExtractedStep {
  stepKey: string
  label: string
  toolName: string
  params: Record<string, ParamBinding>
  dependsOn: string[]
}

export interface NormalizeStepsResult {
  steps: ExtractedStep[]
  keyMap: Map<string, string>
  errors: string[]
}

export function normalizeStepKeys(steps: RawStep[]): NormalizeStepsResult {
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
    steps: normalizedSteps.map((step) => ({
      ...step,
      dependsOn: step.dependsOn.map((dep) => keyMap.get(dep) ?? dep),
      params: updateParamBindingRefs(step.params, keyMap),
    })),
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
  if (binding.type === "step") {
    return { ...binding, stepId: idMap.get(binding.stepId) ?? binding.stepId }
  }
  if (binding.type === "template") {
    return { ...binding, variables: updateParamBindingRefs(binding.variables, idMap) }
  }
  if (binding.type === "object") {
    return { ...binding, entries: updateParamBindingRefs(binding.entries, idMap) }
  }
  if (binding.type === "array") {
    return { ...binding, items: binding.items.map((item) => updateBindingRef(item, idMap)) }
  }
  return binding
}
