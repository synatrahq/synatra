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
import { buildExtractionPrompt, buildRetryPrompt } from "./recipe-extract-prompt"
import type {
  RecipeInput,
  RecipeOutput,
  Value,
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

  function validateBinding(binding: Value, stepKey: string, paramPath: string): void {
    if (!binding || typeof binding !== "object" || !("type" in binding)) {
      errors.push(`Step "${stepKey}" param "${paramPath}" is not a valid binding`)
      return
    }
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
          if (part.type === "expr") {
            validateBinding(part.value, stepKey, `${paramPath}.parts[${index}].value`)
          }
        }
        break
      case "object":
        for (const [key, entryBinding] of Object.entries(binding.entries)) {
          validateBinding(entryBinding, stepKey, `${paramPath}.entries.${key}`)
        }
        break
      case "array":
        binding.items.forEach((item, index) => {
          validateBinding(item, stepKey, `${paramPath}.items[${index}]`)
        })
        break
    }
  }

  for (const step of steps) {
    if (step.type === "query" || step.type === "code" || step.type === "output") {
      validateBinding(step.config.params, step.stepKey, "params")
    }

    if (step.type === "input") {
      validateBinding(step.config.params.title, step.stepKey, "params.title")
      if (step.config.params.description) {
        validateBinding(step.config.params.description, step.stepKey, "params.description")
      }
      step.config.params.fields.forEach((field, index) => {
        for (const [key, value] of Object.entries(field)) {
          if (value === undefined) continue
          validateBinding(value as Value, step.stepKey, `params.fields[${index}].${key}`)
        }
      })
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
  switch (msg.type) {
    case "user":
      return ["## User Message", msg.content ?? "", ""]
    case "assistant":
      return msg.content ? ["## Assistant Response", msg.content, ""] : []
    case "tool_call":
      if (!msg.toolCall) return []
      return [`## Tool Call: ${msg.toolCall.name}`, "```json", JSON.stringify(msg.toolCall.params, null, 2), "```", ""]
    case "tool_result":
      if (!msg.toolResult) return []
      if (msg.toolResult.error) return ["## Tool Result (Error)", `Error: ${msg.toolResult.error}`, ""]
      return ["## Tool Result", "```json", JSON.stringify(sampleValue(msg.toolResult.result), null, 2), "```", ""]
    default:
      return []
  }
}

export function formatConversationForLLM(context: ConversationContext): string {
  return ["# Conversation Log", "", ...context.messages.flatMap(formatMessage)].join("\n")
}

export function buildRecipeExtractionPrompt(context: ConversationContext): string {
  return buildExtractionPrompt(
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
  params: Record<string, Value>
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
  const normalizedParams = updateValueRefs(params, keyMap)

  if (toolName in OUTPUT_KIND_MAP) {
    const kind = OUTPUT_KIND_MAP[toolName]
    return {
      stepKey,
      label,
      type: "output",
      config: {
        kind,
        params: { type: "object", entries: normalizedParams },
      },
    }
  }

  if (toolName === "human_request") {
    const titleBinding = normalizedParams.title ?? { type: "literal" as const, value: "User Input" }
    const descBinding = normalizedParams.description
    const fieldsBinding = normalizedParams.fields

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
        const data: Value = isBinding
          ? updateBindingRef(dataValue as Value, keyMap)
          : { type: "literal" as const, value: dataValue ?? [] }

        return {
          kind: { type: "literal" as const, value: "select_rows" },
          key: { type: "literal" as const, value: String(f.key ?? "selection") },
          columns: { type: "literal" as const, value: (f.columns as Array<{ key: string; label: string }>) ?? [] },
          data,
          selectionMode: { type: "literal" as const, value: (f.selectionMode as "single" | "multiple") ?? "multiple" },
        }
      }
      if (f.kind === "form") {
        const defaultsValue = f.defaults ?? f.defaultsBinding
        const isBinding =
          defaultsValue &&
          typeof defaultsValue === "object" &&
          "type" in defaultsValue &&
          ["literal", "ref", "template", "object", "array"].includes((defaultsValue as { type: string }).type)
        const defaults: Value | undefined = isBinding
          ? updateBindingRef(defaultsValue as Value, keyMap)
          : defaultsValue
            ? { type: "literal" as const, value: defaultsValue }
            : undefined

        return {
          kind: { type: "literal" as const, value: "form" },
          key: { type: "literal" as const, value: String(f.key ?? "form") },
          schema: { type: "literal" as const, value: (f.schema as Record<string, unknown>) ?? {} },
          defaults,
        }
      }
      if (f.kind === "question") {
        return {
          kind: { type: "literal" as const, value: "question" },
          key: { type: "literal" as const, value: String(f.key ?? "question") },
          questions: {
            type: "literal" as const,
            value:
              (f.questions as Array<{
                question: string
                header: string
                options: Array<{ label: string; description: string }>
                multiSelect?: boolean
              }>) ?? [],
          },
        }
      }
      return {
        kind: { type: "literal" as const, value: "form" },
        key: { type: "literal" as const, value: String(f.key ?? "field") },
        schema: { type: "literal" as const, value: {} },
      }
    })

    return {
      stepKey,
      label,
      type: "input",
      config: {
        params: {
          title: titleBinding,
          description: descBinding,
          fields: convertedFields as InputStepConfig["params"]["fields"],
        },
      },
    }
  }

  if (toolName === "code_execute") {
    const codeBinding = normalizedParams.code
    const inputBinding = normalizedParams.input
    const timeoutBinding = normalizedParams.timeout
    const code = codeBinding ?? { type: "literal" as const, value: "" }
    const params = inputBinding ?? { type: "object" as const, entries: {} }
    const timeoutMs = timeoutBinding

    return {
      stepKey,
      label,
      type: "code",
      config: {
        code,
        timeoutMs,
        params,
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
        paramSchema: agentTool.params as Record<string, unknown>,
        returnSchema: agentTool.returns as Record<string, unknown>,
        code: { type: "literal" as const, value: agentTool.code },
        timeoutMs:
          agentTool.timeoutMs !== undefined ? { type: "literal" as const, value: agentTool.timeoutMs } : undefined,
        params: { type: "object", entries: normalizedParams },
      },
    }
  }

  return {
    stepKey,
    label,
    type: "query",
    config: {
      description: `Unknown tool: ${toolName}`,
      paramSchema: {},
      returnSchema: {},
      code: { type: "literal" as const, value: `throw new Error("Unknown tool: ${toolName}")` },
      params: { type: "object", entries: normalizedParams },
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

export function updateValueRefs(params: Record<string, Value>, idMap: Map<string, string>): Record<string, Value> {
  return Object.fromEntries(Object.entries(params).map(([key, binding]) => [key, updateBindingRef(binding, idMap)]))
}

export function updateBindingRef(binding: Value, idMap: Map<string, string>): Value {
  if (binding.type === "ref" && binding.scope === "step") {
    return { ...binding, key: idMap.get(binding.key) ?? binding.key }
  }
  if (binding.type === "template") {
    return {
      ...binding,
      parts: binding.parts.map((part) =>
        part.type === "text" ? part : { ...part, value: updateBindingRef(part.value, idMap) },
      ),
    }
  }
  if (binding.type === "object") {
    return { ...binding, entries: updateValueRefs(binding.entries, idMap) }
  }
  if (binding.type === "array") {
    return { ...binding, items: binding.items.map((item) => updateBindingRef(item, idMap)) }
  }
  return binding
}
