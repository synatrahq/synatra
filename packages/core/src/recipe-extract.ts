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
        lines.push(JSON.stringify(msg.toolResult.result, null, 2))
        lines.push("```")
      }
      lines.push("")
    }
  }

  return lines.join("\n")
}

export const RECIPE_EXTRACTION_PROMPT = `You are a recipe extraction assistant. Given a conversation log from an AI agent run, extract a deterministic recipe that can replay the same sequence of operations.

## Output Format

Return a JSON object with this structure:
{
  "name": "Recipe name",
  "description": "What this recipe does",
  "inputs": [
    {
      "key": "string",
      "label": "string",
      "type": "string" | "number" | "date" | "dateRange" | "select",
      "required": true/false
    }
  ],
  "steps": [
    {
      "id": "step_0",
      "toolName": "string",
      "params": {
        "paramName": { ParamBinding }
      },
      "dependsOn": ["step_ids"]
    }
  ],
  "outputs": [
    {
      "stepId": "string",
      "kind": "table" | "chart" | "markdown" | "key_value",
      "name": "string (optional)"
    }
  ]
}

## ParamBinding Types

- Static value: { "type": "static", "value": any }
- Recipe input: { "type": "input", "inputKey": "string" }
- Previous step result: { "type": "step", "stepId": "string", "path": "$.jsonpath" (optional) }
- Template string: { "type": "template", "template": "string with {{var}}", "variables": { "var": ParamBinding } }
- Object construction: { "type": "object", "entries": { "key": ParamBinding } }

## Step Binding with Path (JSONPath)

Use path to access nested values or array elements:
- Whole result: { "type": "step", "stepId": "step_0" }
- Nested field: { "type": "step", "stepId": "step_0", "path": "$.users[0].email" }
- Array mapping: { "type": "step", "stepId": "step_0", "path": "$[*].id" }

## When to use code_execute

When the LLM performed data transformation that cannot be expressed with simple path:
- Filtering: \`input.data.filter(x => x.active)\`
- Mapping with transformation: \`input.data.map(x => ({ id: x.id, label: x.name }))\`
- Conditional logic: \`input.count > 0 ? input.items[0] : null\`
- String formatting: \`\\\`Total: \\\${input.items.length}\\\`\`

IMPORTANT: The \`input\` parameter of code_execute MUST be an object (not an array or primitive).
If you need to pass an array from a previous step, wrap it using the "object" binding type:

Example - transforming array data from a previous step:
{
  "id": "step_N",
  "toolName": "code_execute",
  "params": {
    "code": { "type": "static", "value": "return input.data.filter(x => x.active)" },
    "input": {
      "type": "object",
      "entries": {
        "data": { "type": "step", "stepId": "step_M" }
      }
    }
  },
  "dependsOn": ["step_M"]
}

The code then accesses the array via \`input.data\`.

## System Tools Handling

- output_table, output_chart, output_markdown, output_key_value: Include as regular steps
- human_request (form/question/select_rows): Include as steps, will pause execution for user input
- task_complete: Do NOT include, recipe completes after last step

## Guidelines

1. **Consult the Tool Schemas section** to understand:
   - Parameter types for each tool (what input types are expected)
   - Return types for each tool (what output types are produced)
   - Use this information to create correct bindings between steps

2. Analyze the conversation to identify:
   - Tool calls and their parameters
   - Data transformations between tool calls
   - User inputs that should become recipe inputs
   - Outputs that should be displayed

3. Create steps in execution order with proper dependencies

4. Identify values that should be parameterized as recipe inputs

5. Use code_execute for any LLM reasoning/transformation between steps

6. Ensure all step references are valid and there are no circular dependencies
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
