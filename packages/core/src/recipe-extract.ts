import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { withDb } from "./database"
import { MessageTable } from "./schema/message.sql"
import { RunTable } from "./schema/run.sql"
import { ThreadTable } from "./schema/thread.sql"
import { AgentReleaseTable, AgentWorkingCopyTable } from "./schema/agent.sql"
import { createError } from "@synatra/util/error"
import { principal } from "./principal"
import { COMPUTE_TOOLS, OUTPUT_TOOLS, HUMAN_TOOLS } from "./system-tools"
import type { RecipeStep, RecipeInput, RecipeOutput, ParamBinding, AgentRuntimeConfig, AgentTool } from "./types"

function first<T>(arr: T[]): T | undefined {
  return arr[0]
}

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
  steps: RecipeStep[]
  outputs: RecipeOutput[]
}

export function validateRecipeSteps(steps: RecipeStep[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const stepIds = new Set(steps.map((s) => s.id))

  for (const step of steps) {
    for (const depId of step.dependsOn) {
      if (!stepIds.has(depId)) {
        errors.push(`Step "${step.id}" depends on non-existent step "${depId}"`)
      }
    }

    for (const [paramName, binding] of Object.entries(step.params)) {
      if (binding.type === "step" && !stepIds.has(binding.stepId)) {
        errors.push(`Step "${step.id}" param "${paramName}" references non-existent step "${binding.stepId}"`)
      }
    }
  }

  const visited = new Set<string>()
  const visiting = new Set<string>()

  function hasCycle(stepId: string): boolean {
    if (visiting.has(stepId)) return true
    if (visited.has(stepId)) return false

    visiting.add(stepId)
    const step = steps.find((s) => s.id === stepId)
    if (step) {
      for (const depId of step.dependsOn) {
        if (hasCycle(depId)) return true
      }
    }
    visiting.delete(stepId)
    visited.add(stepId)
    return false
  }

  for (const step of steps) {
    if (hasCycle(step.id)) {
      errors.push(`Circular dependency detected involving step "${step.id}"`)
      break
    }
  }

  return { valid: errors.length === 0, errors }
}

export function formatToolSchemas(agentTools: AgentTool[]): string {
  const lines: string[] = []

  lines.push("# Available Tools")
  lines.push("")

  lines.push("## Agent Tools")
  lines.push("")
  for (const tool of agentTools) {
    lines.push(`### ${tool.name}`)
    lines.push(`${tool.description}`)
    lines.push("")
    lines.push("**Parameters:**")
    lines.push("```json")
    lines.push(JSON.stringify(tool.params, null, 2))
    lines.push("```")
    lines.push("")
    lines.push("**Returns:**")
    lines.push("```json")
    lines.push(JSON.stringify(tool.returns, null, 2))
    lines.push("```")
    lines.push("")
  }

  lines.push("## System Tools (for Recipe)")
  lines.push("")

  const systemTools = [...COMPUTE_TOOLS, ...OUTPUT_TOOLS, ...HUMAN_TOOLS]
  for (const tool of systemTools) {
    lines.push(`### ${tool.name}`)
    lines.push(`${tool.description}`)
    lines.push("")
    lines.push("**Parameters:**")
    lines.push("```json")
    lines.push(JSON.stringify(tool.params, null, 2))
    lines.push("```")
    lines.push("")
  }

  return lines.join("\n")
}

export function formatConversationForLLM(context: ConversationContext): string {
  const lines: string[] = []

  lines.push("# Conversation Log")
  lines.push("")

  for (const msg of context.messages) {
    if (msg.type === "user") {
      lines.push(`## User Message`)
      lines.push(msg.content ?? "")
      lines.push("")
    } else if (msg.type === "assistant" && msg.content) {
      lines.push(`## Assistant Response`)
      lines.push(msg.content)
      lines.push("")
    } else if (msg.type === "tool_call" && msg.toolCall) {
      lines.push(`## Tool Call: ${msg.toolCall.name}`)
      lines.push("```json")
      lines.push(JSON.stringify(msg.toolCall.params, null, 2))
      lines.push("```")
      lines.push("")
    } else if (msg.type === "tool_result" && msg.toolResult) {
      if (msg.toolResult.error) {
        lines.push(`## Tool Result (Error)`)
        lines.push(`Error: ${msg.toolResult.error}`)
      } else {
        lines.push(`## Tool Result`)
        lines.push("```json")
        lines.push(JSON.stringify(sampleValue(msg.toolResult.result), null, 2))
        lines.push("```")
      }
      lines.push("")
    }
  }

  return lines.join("\n")
}

export const RECIPE_EXTRACTION_PROMPT = `You are a recipe extraction assistant. Your goal is to create a **generalized, reusable workflow** from a conversation log.

IMPORTANT: The conversation is just ONE example use case. Your recipe should be flexible enough for future runs with different data.

Generalization principles:
- **Don't hardcode data values** - Use bindings to pass data from previous steps
- **Let tools determine output structure** - If a query returns columns, display ALL returned columns, not just the ones shown in this conversation
- **Derive display data from source** - Chart labels/values, table columns should come from actual query results
- **Analyze tool capabilities** - Understand what each tool can return and build flexible data flows

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
  "inputs": [{ "key": "user_id", "label": "User ID", "type": "string", "required": true }],
  "steps": [{ "id": "snake_case_id", "label": "Human readable", "toolName": "tool", "params": { ... }, "dependsOn": [] }],
  "outputs": [{ "stepId": "output_step_id", "kind": "table" }]
}

Input types: "string" | "number" | "date" | "dateRange" | "select"
Output kinds: "table" | "chart" | "markdown" | "key_value"

---

## ParamBinding Reference

Each parameter in a step uses a ParamBinding to determine its value at runtime.

### Choosing the Right Binding Type

\`\`\`
Is the value always the same?
├─ YES → static
└─ NO → Should user provide it each run?
         ├─ YES → input
         └─ NO → Does it come from a previous step?
                  ├─ YES → Can you get it with a simple path?
                  │         ├─ YES → step (with optional path)
                  │         └─ NO (needs filter/map/logic) → code_execute
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

Use for: Values that change each time the recipe runs
{ "type": "input", "inputKey": "string" }

Example:
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
  "id": "show_report",
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
  "id": "filter_active",
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
- human_request: Pause for user input (form/question/select_rows)

Do NOT include:
- task_complete: Recipe completes automatically after last step

---

## output_chart - Dynamic Data

IMPORTANT: Chart data (labels and datasets[].data) should come from previous steps, NOT be hardcoded.
Use code_execute to format data into the chart structure, then pass the result to output_chart.

Example - Chart with dynamic data from calculation step:
{
  "id": "prepare_chart_data",
  "label": "Prepare chart data",
  "toolName": "code_execute",
  "params": {
    "code": { "type": "static", "value": "return { labels: Object.keys(input.totals), datasets: [{ label: 'Count', data: Object.values(input.totals) }] }" },
    "input": {
      "type": "object",
      "entries": {
        "totals": { "type": "step", "stepId": "calculate_totals" }
      }
    }
  },
  "dependsOn": ["calculate_totals"]
}

{
  "id": "display_chart",
  "label": "Display distribution chart",
  "toolName": "output_chart",
  "params": {
    "type": { "type": "static", "value": "bar" },
    "data": { "type": "step", "stepId": "prepare_chart_data" }
  },
  "dependsOn": ["prepare_chart_data"]
}

BAD (hardcoded data - will not update when source data changes):
{
  "params": {
    "data": {
      "type": "static",
      "value": { "labels": ["A", "B"], "datasets": [{ "data": [10, 20] }] }
    }
  }
}

---

## Step Design

**id**: Unique snake_case identifier describing purpose
- Good: "fetch_active_users", "calculate_total", "send_email"
- Bad: "step_0", "step_1", "s1"

**label**: Human-readable description for UI
- Good: "Fetch active users", "Calculate order total"

**dependsOn**: List step IDs that must complete before this step
- Must reference existing step IDs
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
