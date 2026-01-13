import { streamText, tool, jsonSchema, hasToolCall, type JSONSchema7, type ModelMessage } from "ai"
import { z } from "zod"
import {
  listTriggers,
  updateAgentCopilotInFlightState,
  getAgentCopilotMessageHistory,
  createAgentCopilotMessage,
  createAgentCopilotProposalAndRejectPending,
  createAgentCopilotResourceRequest,
  createAgentCopilotQuestionRequest,
  createAgentCopilotTriggerRequest,
} from "@synatra/core"
import type { CopilotInFlightState, CopilotTriggerConfig } from "@synatra/core/schema"
import {
  UserConfigurableResourceType,
  type CopilotToolCall,
  type CopilotQuestion,
  type AskQuestionsResult,
  type CopilotQuestionResult,
  type TriggerType,
  type TriggerMode,
} from "@synatra/core/types"
import { emitCopilotEvent } from "../stream"
import { AgentRuntimeConfigSchema, type AgentRuntimeConfig } from "@synatra/core/types"
import { createResourceGateway, loadConfig, type ColumnInfo } from "@synatra/service-call"
import { searchEndpointsWithLLM, formatSearchResultsForLLM, getApiSummary } from "../../api-search"
import { buildCopilotSystemPrompt, type TemplateInfo } from "../../copilot-prompt"
import { getModel } from "../../models"

const gateway = createResourceGateway(loadConfig("server"))

type CopilotMessage = {
  role: "user" | "assistant"
  content: string
}

export type ResourceInfo = {
  id: string
  slug: string
  type: string
  description: string | null
}

function formatColumnsForLLM(columns: ColumnInfo[]): string {
  return columns
    .map((c) => {
      const flags = [
        c.isPrimaryKey && "PK",
        c.isUnique && "UNIQUE",
        c.nullable && "NULL",
        c.isAutoIncrement && "AUTO",
        c.foreignKey && `FK->${c.foreignKey.table}.${c.foreignKey.column}`,
      ]
        .filter(Boolean)
        .join(", ")
      return `${c.name}: ${c.type}${flags ? ` (${flags})` : ""}`
    })
    .join("\n")
}

async function buildResourceContext(
  organizationId: string,
  resources: ResourceInfo[],
  environmentId: string | null,
): Promise<string> {
  const contexts = await Promise.all(
    resources.map(async (r) => {
      if ((r.type === "postgres" || r.type === "mysql") && environmentId) {
        const result = await gateway.tables(organizationId, r.id, environmentId)
        if (result.ok && result.data.length > 0) {
          const tables = result.data.map((t) => `${t.schema}.${t.name}`).join(", ")
          return `<resource slug="${r.slug}" type="${r.type}">
Tables: ${tables}
Use get_table_details("${r.slug}", "tableName") for column details.
</resource>`
        }
      }

      if (r.type === "github" || r.type === "stripe" || r.type === "intercom") {
        const summary = getApiSummary(r.type)
        if (summary) {
          return `<resource slug="${r.slug}" type="${r.type}">
${summary}
Use get_api_endpoint("${r.slug}", "search term") for detailed docs.
</resource>`
        }
      }

      return `<resource slug="${r.slug}" type="${r.type}">${r.description ?? ""}</resource>`
    }),
  )

  return contexts.join("\n\n")
}

const MAX_SUBMIT_RETRIES = 3

type SubmitConfigResult =
  | { ok: true; config: AgentRuntimeConfig; explanation: string }
  | { ok: false; error: string; rawInput: unknown }

function validateSubmitConfig(args: {
  explanation: string
  config: Record<string, unknown> | string
}): SubmitConfigResult {
  let configObj: Record<string, unknown>
  try {
    configObj = typeof args.config === "string" ? JSON.parse(args.config) : args.config
  } catch (jsonError) {
    const errorMsg = jsonError instanceof Error ? jsonError.message : "Unknown JSON error"
    return { ok: false, error: `Invalid JSON: ${errorMsg}`, rawInput: args.config }
  }

  const parsed = AgentRuntimeConfigSchema.safeParse(configObj)
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    return { ok: false, error: `Schema validation failed: ${errors}`, rawInput: configObj }
  }

  return { ok: true, config: parsed.data, explanation: args.explanation }
}

type InFlightToolCall = {
  toolCallId: string
  toolName: string
  argsText: string
  status: "streaming" | "executing" | "completed"
}

export type RunCopilotLLMInput = {
  organizationId: string
  threadId: string
  agentId: string
  message: string
  currentConfig: AgentRuntimeConfig
  pendingProposalConfig: AgentRuntimeConfig | null
  resources: ResourceInfo[]
  environmentId: string | null
  initialSeq: number
  modelId?: string
  template?: TemplateInfo | null
}

export async function runCopilotLLM(input: RunCopilotLLMInput) {
  const {
    organizationId,
    threadId,
    agentId,
    message,
    currentConfig,
    pendingProposalConfig,
    resources,
    environmentId,
    modelId,
    template,
  } = input
  let currentSeq = input.initialSeq

  let inFlightState: CopilotInFlightState = {
    status: "thinking",
    reasoningText: "",
    streamingText: "",
    toolCalls: [],
  }

  const updateInFlight = async (updates: Partial<NonNullable<CopilotInFlightState>>) => {
    if (!inFlightState) {
      inFlightState = { status: "thinking", reasoningText: "", streamingText: "", toolCalls: [] }
    }
    inFlightState = { ...inFlightState, ...updates }
    await updateAgentCopilotInFlightState({ threadId, state: inFlightState })
  }

  const history = await getAgentCopilotMessageHistory({ threadId, limit: 20 })

  const baseMessages: CopilotMessage[] = history.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const modelConfig = await getModel(modelId)

  const resourcesContext =
    resources.length > 0 ? await buildResourceContext(organizationId, resources, environmentId) : ""

  const pendingProposalSection = pendingProposalConfig
    ? `
<pending-proposal>
There is a pending configuration proposal that has NOT been applied yet.
The user may want to build upon, modify, or refine this proposal.
When the user asks for additional changes, apply them to this pending configuration, not the current configuration.

Pending Configuration:
\`\`\`json
${JSON.stringify(pendingProposalConfig, null, 2)}
\`\`\`
</pending-proposal>
`
    : ""

  const contextPrompt = `
Current Agent Configuration (currently applied):
\`\`\`json
${JSON.stringify(currentConfig, null, 2)}
\`\`\`
${pendingProposalSection}
<available-resources>
${resourcesContext || "No resources configured."}
</available-resources>
User request: ${message}
`

  const getTableDetailsTool = tool({
    description: "Get detailed column information for a database table",
    inputSchema: z.object({
      resourceSlug: z.string().describe("The resource slug"),
      tableName: z.string().describe("The table name to get details for"),
    }),
    execute: async (args) => {
      if (!environmentId) return "Error: No environment selected"
      const resource = resources.find((r) => r.slug === args.resourceSlug)
      if (!resource) return `Error: Resource "${args.resourceSlug}" not found`
      const result = await gateway.columns(organizationId, resource.id, environmentId, args.tableName)
      if (!result.ok) return `Error: ${result.error}`
      return formatColumnsForLLM(result.data)
    },
  })

  const getApiEndpointTool = tool({
    description: "Search for API endpoint documentation. Use this to find relevant endpoints for the user's request.",
    inputSchema: z.object({
      resourceSlug: z.string().describe("The resource slug (github, stripe, or intercom)"),
      searchQuery: z.string().describe("What to search for (e.g. 'list repositories', 'create customer')"),
    }),
    execute: async (args) => {
      const resource = resources.find((r) => r.slug === args.resourceSlug)
      if (!resource) return `Error: Resource "${args.resourceSlug}" not found`
      const resourceType = resource.type as "github" | "stripe" | "intercom"
      const searchResults = await searchEndpointsWithLLM(resourceType, args.searchQuery)
      return formatSearchResultsForLLM(searchResults)
    },
  })

  const submitConfigTool = tool({
    description:
      "Submit a configuration change proposal for the agent. Call this tool when the user requests changes to the agent configuration.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        explanation: { type: "string", description: "Clear explanation of what changes you made and why" },
        config: {
          type: "object",
          description: "Complete AgentRuntimeConfig object",
          properties: {
            model: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["openai", "anthropic", "google"] },
                model: { type: "string" },
                temperature: { type: "number" },
                topP: { type: "number" },
                reasoning: {
                  type: "object",
                  properties: {
                    effort: { type: "string", enum: ["low", "medium", "high", "xhigh"] },
                    budgetTokens: { type: "number" },
                  },
                },
              },
              required: ["provider", "model", "temperature"],
            },
            systemPrompt: { type: "string" },
            tools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  params: { type: "object" },
                  returns: { type: "object" },
                  code: { type: "string" },
                  timeoutMs: { type: "number" },
                  requiresReview: { type: "boolean" },
                  approvalAuthority: { type: "string", enum: ["owner_only", "any_member"] },
                  selfApproval: { type: "boolean" },
                  approvalTimeoutMs: { type: "number" },
                },
                required: ["name", "description", "params", "returns", "code"],
              },
            },
            subagents: {
              type: "array",
              description: "Subagents that can be delegated to. Each creates a delegate_to_{alias} tool.",
              items: {
                type: "object",
                properties: {
                  agentId: { type: "string", description: "ID of the agent to delegate to" },
                  alias: { type: "string", description: "Alias for the delegation tool name (delegate_to_{alias})" },
                  description: {
                    type: "string",
                    description: "Description shown to the LLM for when to use this subagent",
                  },
                  versionMode: {
                    type: "string",
                    enum: ["current", "fixed"],
                    description: "Whether to use current or fixed version",
                  },
                  releaseId: { type: "string", description: "Release ID when versionMode is fixed" },
                },
                required: ["agentId", "description", "versionMode"],
              },
            },
            $defs: { type: "object", description: "Reusable type definitions" },
            maxIterations: { type: "number" },
            maxToolCallsPerIteration: { type: "number" },
            maxActiveTimeMs: { type: "number" },
          },
          required: ["model", "systemPrompt", "tools"],
        },
      },
      required: ["explanation", "config"],
    } as JSONSchema7),
  })

  const requestResourceConnectionTool = tool({
    description:
      "Request the user to connect a new resource. Call this tool ONCE per turn for ONE category of resource. The 'suggestions' array lists ALTERNATIVE options within that category (e.g., [postgres, mysql] for databases) - do NOT mix different categories. If you need multiple categories (e.g., database AND CRM), request the most critical one first. After the user connects it, you can request the next category in a follow-up turn.",
    inputSchema: z.object({
      explanation: z
        .string()
        .describe(
          "Why this specific category of resource is needed (e.g., 'To store customer data, I need a database')",
        ),
      suggestions: z
        .array(
          z.object({
            type: z.enum(UserConfigurableResourceType),
            reason: z.string().describe("Why this specific option would work"),
          }),
        )
        .min(1)
        .max(3)
        .describe(
          "Alternative options within the SAME category (e.g., [postgres, mysql] for databases, [intercom] for CRM). Do NOT mix categories.",
        ),
    }),
  })

  const askQuestionsTool = tool({
    description:
      "Ask the user questions with predefined options. Use this instead of asking text questions.\n" +
      "- Present 1-4 questions at a time\n" +
      "- Each question has 2-4 options with label and description\n" +
      "- 'Other' option is automatically added for custom text input\n" +
      "- Use multiSelect: true when multiple options can be selected",
    inputSchema: z.object({
      questions: z
        .array(
          z.object({
            question: z.string().describe("The question to ask the user"),
            header: z.string().max(12).describe("Short label for the question (max 12 chars)"),
            options: z
              .array(
                z.object({
                  label: z.string().describe("Short option label (1-5 words)"),
                  description: z.string().describe("Explanation of what this option means"),
                }),
              )
              .min(2)
              .max(4),
            multiSelect: z
              .boolean()
              .describe("true: checkboxes (multiple selections), false: radio buttons (single selection)"),
          }),
        )
        .min(1)
        .max(4),
    }),
  })

  const getTriggersTool = tool({
    description:
      "Get all triggers configured for this agent. Use this to understand existing trigger configurations before creating or updating.",
    inputSchema: z.object({}),
    execute: async () => {
      const triggers = await listTriggers()
      const agentTriggers = triggers.filter((t) => t.agentId === agentId)
      if (agentTriggers.length === 0) return "No triggers configured for this agent."
      return agentTriggers
        .map((t) => {
          const parts = [`Trigger: ${t.name} (${t.slug})`, `  ID: ${t.id}`, `  Type: ${t.type}`, `  Mode: ${t.mode}`]
          if (t.type === "schedule" && t.cron) parts.push(`  Cron: ${t.cron} (${t.timezone})`)
          if (t.type === "app" && t.appEvents) parts.push(`  Events: ${t.appEvents.join(", ")}`)
          if (t.mode === "template" && t.template) parts.push(`  Template: ${t.template.slice(0, 100)}...`)
          return parts.join("\n")
        })
        .join("\n\n")
    },
  })

  const createTriggerTool = tool({
    description:
      "Create a new trigger for this agent. A trigger defines how and when the agent is invoked.\n" +
      "Trigger types:\n" +
      "- webhook: Invoked via HTTP POST request\n" +
      "- schedule: Invoked on a cron schedule\n" +
      "- app: Invoked by app events (e.g., Slack, GitHub)\n\n" +
      "Trigger modes:\n" +
      "- template: Use a template string with {{payload.field}} placeholders\n" +
      "- script: Use JavaScript to transform the payload\n" +
      "- prompt: Use an existing prompt configuration",
    inputSchema: z.object({
      name: z.string().describe("Display name for the trigger"),
      explanation: z.string().describe("Explanation of what this trigger does and why it's being created"),
      type: z.enum(["webhook", "schedule", "app"]).describe("Type of trigger"),
      mode: z.enum(["template", "script", "prompt"]).default("template").describe("How to generate the agent prompt"),
      template: z.string().optional().describe("Template string for template mode"),
      script: z.string().optional().describe("JavaScript code for script mode"),
      cron: z.string().optional().describe("Cron expression for schedule type (e.g., '0 9 * * *' for 9am daily)"),
      timezone: z.string().default("UTC").describe("Timezone for schedule type"),
      appAccountId: z.string().optional().describe("App account ID for app type"),
      appEvents: z.array(z.string()).optional().describe("Event types to listen for in app type"),
    }),
  })

  const updateTriggerTool = tool({
    description:
      "Update an existing trigger's configuration. Only provide the fields you want to change.\n" +
      "Use get_triggers first to see current configurations and get trigger IDs.",
    inputSchema: z.object({
      triggerId: z.string().describe("The ID of the trigger to update"),
      explanation: z.string().describe("Explanation of what changes are being made and why"),
      name: z.string().optional().describe("New display name for the trigger"),
      type: z.enum(["webhook", "schedule", "app"]).optional().describe("New trigger type"),
      mode: z.enum(["template", "script", "prompt"]).optional().describe("New prompt generation mode"),
      template: z.string().optional().describe("New template string"),
      script: z.string().optional().describe("New JavaScript code"),
      cron: z.string().nullable().optional().describe("New cron expression (null to remove)"),
      timezone: z.string().optional().describe("New timezone"),
      appAccountId: z.string().nullable().optional().describe("New app account ID (null to remove)"),
      appEvents: z.array(z.string()).nullable().optional().describe("New event types (null to remove)"),
    }),
  })

  const hasDbResources = resources.some((r) => r.type === "postgres" || r.type === "mysql")
  const hasApiResources = resources.some((r) => r.type === "github" || r.type === "stripe" || r.type === "intercom")

  const allTools = {
    submit_config: submitConfigTool,
    request_resource_connection: requestResourceConnectionTool,
    ask_questions: askQuestionsTool,
    get_triggers: getTriggersTool,
    create_trigger: createTriggerTool,
    update_trigger: updateTriggerTool,
    ...(hasDbResources ? { get_table_details: getTableDetailsTool } : {}),
    ...(hasApiResources ? { get_api_endpoint: getApiEndpointTool } : {}),
  }

  let assistantText = ""
  const toolCalls: CopilotToolCall[] = []
  let proposal: { id: string; config: AgentRuntimeConfig; explanation: string } | null = null
  let resourceRequest: {
    explanation: string
    suggestions: { type: string; reason: string }[]
  } | null = null
  let questionRequest: {
    toolCallId: string
    questions: CopilotQuestion[]
  } | null = null
  let triggerRequest: {
    action: "create" | "update"
    triggerId?: string
    explanation: string
    config: CopilotTriggerConfig
  } | null = null
  let validationError: string | null = null

  const conversationMessages: ModelMessage[] = [
    ...baseMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: contextPrompt },
  ]

  let retryCount = 0

  console.log("[Copilot] Starting LLM request", {
    threadId,
    messagePreview: message.slice(0, 200),
    resourceCount: resources.length,
  })

  try {
    while (retryCount <= MAX_SUBMIT_RETRIES) {
      const enableThinking = modelConfig.supportsThinking && retryCount === 0

      const result = streamText({
        model: modelConfig.model,
        system: buildCopilotSystemPrompt(resources, template),
        messages: conversationMessages,
        tools: allTools,
        stopWhen: [
          hasToolCall("ask_questions"),
          hasToolCall("submit_config"),
          hasToolCall("request_resource_connection"),
          hasToolCall("create_trigger"),
          hasToolCall("update_trigger"),
        ],
        temperature: enableThinking ? undefined : 0.7,
        providerOptions: enableThinking
          ? { anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } } }
          : undefined,
        onChunk: async ({ chunk }) => {
          if (chunk.type === "reasoning-delta") {
            currentSeq++
            await emitCopilotEvent({
              threadId,
              seq: currentSeq,
              type: "copilot.reasoning_delta",
              data: { delta: chunk.text },
            })
            const newReasoningText = (inFlightState?.reasoningText ?? "") + chunk.text
            await updateInFlight({ status: "reasoning", reasoningText: newReasoningText })
          } else if (chunk.type === "tool-input-start") {
            currentSeq++
            await emitCopilotEvent({
              threadId,
              seq: currentSeq,
              type: "copilot.tool_call.streaming_start",
              data: { toolCallId: chunk.id, toolName: chunk.toolName },
            })
            const newToolCalls: InFlightToolCall[] = [
              ...(inFlightState?.toolCalls ?? []),
              { toolCallId: chunk.id, toolName: chunk.toolName, argsText: "", status: "streaming" },
            ]
            await updateInFlight({ status: "tool_call", toolCalls: newToolCalls })
          } else if (chunk.type === "tool-input-delta") {
            currentSeq++
            await emitCopilotEvent({
              threadId,
              seq: currentSeq,
              type: "copilot.tool_call.input_delta",
              data: { toolCallId: chunk.id, delta: chunk.delta },
            })
            const newToolCalls = (inFlightState?.toolCalls ?? []).map((tc) =>
              tc.toolCallId === chunk.id ? { ...tc, argsText: tc.argsText + chunk.delta } : tc,
            )
            await updateInFlight({ toolCalls: newToolCalls })
          } else if (chunk.type === "tool-call") {
            currentSeq++
            await emitCopilotEvent({
              threadId,
              seq: currentSeq,
              type: "copilot.tool_call.executing",
              data: { toolCallId: chunk.toolCallId, toolName: chunk.toolName },
            })
            toolCalls.push({
              id: chunk.toolCallId,
              name: chunk.toolName,
              args: chunk.input as Record<string, unknown>,
              result: undefined,
            })
            const newToolCalls = (inFlightState?.toolCalls ?? []).map((tc) =>
              tc.toolCallId === chunk.toolCallId ? { ...tc, status: "executing" as const } : tc,
            )
            await updateInFlight({ toolCalls: newToolCalls })
          } else if (chunk.type === "tool-result") {
            const existing = toolCalls.find((tc) => tc.id === chunk.toolCallId)
            if (existing && "output" in chunk) {
              existing.result = chunk.output
            }
            currentSeq++
            await emitCopilotEvent({
              threadId,
              seq: currentSeq,
              type: "copilot.tool_call.done",
              data: { toolCallId: chunk.toolCallId, toolName: chunk.toolName },
            })
            const newToolCalls = (inFlightState?.toolCalls ?? []).map((tc) =>
              tc.toolCallId === chunk.toolCallId ? { ...tc, status: "completed" as const } : tc,
            )
            await updateInFlight({ toolCalls: newToolCalls })
          } else if (chunk.type === "text-delta") {
            currentSeq++
            await emitCopilotEvent({
              threadId,
              seq: currentSeq,
              type: "copilot.text_delta",
              data: { delta: chunk.text },
            })
            const newStreamingText = (inFlightState?.streamingText ?? "") + chunk.text
            await updateInFlight({ status: "streaming", streamingText: newStreamingText })
          }
        },
      })

      assistantText = await result.text

      const allToolResults = await result.toolResults
      const toolResultsMap = new Map<string, unknown>()
      for (const tr of allToolResults) {
        if (tr && "toolCallId" in tr) {
          toolResultsMap.set(tr.toolCallId, "result" in tr ? tr.result : tr)
        }
      }

      const currentToolCalls = await result.toolCalls
      let needsRetry = false
      let retryErrorMessage = ""
      let failedToolCallId = ""

      for (const tc of currentToolCalls) {
        if (!tc) continue
        const toolResult = toolResultsMap.get(tc.toolCallId)

        const existing = toolCalls.find((t) => t.id === tc.toolCallId)
        if (existing) {
          existing.result = toolResult
        } else {
          toolCalls.push({
            id: tc.toolCallId,
            name: tc.toolName,
            args: tc.input as Record<string, unknown>,
            result: toolResult,
          })
        }

        if (tc.toolName === "submit_config") {
          const args = tc.input as { explanation: string; config: Record<string, unknown> | string }
          const validateResult = validateSubmitConfig(args)

          if (validateResult.ok) {
            proposal = {
              id: "",
              config: validateResult.config,
              explanation: validateResult.explanation,
            }
          } else {
            if (retryCount < MAX_SUBMIT_RETRIES) {
              needsRetry = true
              retryErrorMessage = validateResult.error
              failedToolCallId = tc.toolCallId
            } else {
              validationError = validateResult.error
            }
          }
        }

        if (tc.toolName === "request_resource_connection") {
          const args = tc.input as {
            explanation: string
            suggestions: { type: string; reason: string }[]
          }
          resourceRequest = {
            explanation: args.explanation,
            suggestions: args.suggestions,
          }
        }

        if (tc.toolName === "ask_questions") {
          const args = tc.input as { questions: CopilotQuestion[] }
          questionRequest = {
            toolCallId: tc.toolCallId,
            questions: args.questions,
          }
        }

        if (tc.toolName === "create_trigger") {
          const args = tc.input as {
            name: string
            explanation: string
            type: TriggerType
            mode?: TriggerMode
            template?: string
            script?: string
            cron?: string
            timezone?: string
            appAccountId?: string
            appEvents?: string[]
          }
          triggerRequest = {
            action: "create",
            explanation: args.explanation,
            config: {
              name: args.name,
              type: args.type,
              mode: args.mode,
              template: args.template,
              script: args.script,
              cron: args.cron,
              timezone: args.timezone,
              appAccountId: args.appAccountId,
              appEvents: args.appEvents,
            },
          }
        }

        if (tc.toolName === "update_trigger") {
          const args = tc.input as {
            triggerId: string
            explanation: string
            name?: string
            type?: TriggerType
            mode?: TriggerMode
            template?: string
            script?: string
            cron?: string | null
            timezone?: string
            appAccountId?: string | null
            appEvents?: string[] | null
          }
          triggerRequest = {
            action: "update",
            triggerId: args.triggerId,
            explanation: args.explanation,
            config: {
              name: args.name,
              type: args.type,
              mode: args.mode,
              template: args.template,
              script: args.script,
              cron: args.cron,
              timezone: args.timezone,
              appAccountId: args.appAccountId,
              appEvents: args.appEvents,
            },
          }
        }
      }

      if (needsRetry) {
        retryCount++
        currentSeq++
        await emitCopilotEvent({
          threadId,
          seq: currentSeq,
          type: "copilot.text_delta",
          data: { delta: `\n\n[Retry ${retryCount}/${MAX_SUBMIT_RETRIES}] Configuration error, retrying...\n` },
        })

        const validToolCalls = currentToolCalls.filter(
          (tc): tc is NonNullable<typeof tc> => tc !== null && tc !== undefined,
        )

        conversationMessages.push({
          role: "assistant",
          content: [
            ...(assistantText ? [{ type: "text" as const, text: assistantText }] : []),
            ...validToolCalls.map((tc) => ({
              type: "tool-call" as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input as Record<string, unknown>,
            })),
          ],
        })

        const failedToolCall = validToolCalls.find((tc) => tc.toolCallId === failedToolCallId)
        conversationMessages.push({
          role: "tool",
          content: [
            {
              type: "tool-result" as const,
              toolCallId: failedToolCallId,
              toolName: failedToolCall?.toolName ?? "submit_config",
              output: {
                type: "error-text" as const,
                value: `Error: ${retryErrorMessage}. Please fix the JSON syntax error and call submit_config again with valid JSON.`,
              },
            },
          ],
        })

        assistantText = ""
        continue
      }

      break
    }
  } catch (error) {
    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.error",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    })

    await updateAgentCopilotInFlightState({ threadId, state: null, seq: currentSeq })
    return
  }

  let messageContent = assistantText || (proposal ? proposal.explanation : "")
  if (validationError) {
    messageContent = messageContent ? `${messageContent}\n\n[Error] ${validationError}` : `[Error] ${validationError}`
  }

  const assistantMessage = await createAgentCopilotMessage({
    threadId,
    role: "assistant",
    content: messageContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  })

  if (proposal) {
    const createdProposal = await createAgentCopilotProposalAndRejectPending({
      threadId,
      messageId: assistantMessage.id,
      config: proposal!.config,
      explanation: proposal!.explanation,
    })

    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.proposal.created",
      data: {
        proposal: {
          id: createdProposal.id,
          config: createdProposal.config,
          explanation: createdProposal.explanation,
          status: createdProposal.status,
        },
      },
    })
  }

  if (resourceRequest) {
    const createdRequest = await createAgentCopilotResourceRequest({
      threadId,
      messageId: assistantMessage.id,
      explanation: resourceRequest.explanation,
      suggestions: resourceRequest.suggestions as {
        type: "postgres" | "mysql" | "stripe" | "github" | "intercom" | "restapi"
        reason: string
      }[],
    })

    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.resource_request.created",
      data: {
        resourceRequest: {
          id: createdRequest.id,
          explanation: createdRequest.explanation,
          suggestions: createdRequest.suggestions,
          status: createdRequest.status,
        },
      },
    })
  }

  if (questionRequest) {
    const createdQuestionRequest = await createAgentCopilotQuestionRequest({
      threadId,
      messageId: assistantMessage.id,
      toolCallId: questionRequest.toolCallId,
      questions: questionRequest.questions,
    })

    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.questions.rendered",
      data: {
        id: createdQuestionRequest.id,
        toolCallId: createdQuestionRequest.toolCallId,
        questions: createdQuestionRequest.questions,
      },
    })
  }

  if (triggerRequest) {
    const createdTriggerRequest = await createAgentCopilotTriggerRequest({
      threadId,
      messageId: assistantMessage.id,
      action: triggerRequest.action,
      triggerId: triggerRequest.triggerId,
      explanation: triggerRequest.explanation,
      config: triggerRequest.config,
    })

    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.trigger_request.created",
      data: {
        triggerRequest: {
          id: createdTriggerRequest.id,
          action: createdTriggerRequest.action,
          triggerId: createdTriggerRequest.triggerId,
          explanation: createdTriggerRequest.explanation,
          config: createdTriggerRequest.config,
          status: createdTriggerRequest.status,
        },
      },
    })
  }

  currentSeq++
  await emitCopilotEvent({
    threadId,
    seq: currentSeq,
    type: "copilot.message.created",
    data: { message: assistantMessage },
  })

  const waitingForQuestions = questionRequest !== null
  if (!waitingForQuestions) {
    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.completed",
      data: {},
    })
  }

  await updateAgentCopilotInFlightState({
    threadId,
    state: waitingForQuestions ? inFlightState : null,
    seq: currentSeq,
  })

  console.log("[Copilot] Request completed", {
    threadId,
    toolCallCount: toolCalls.length,
    hasProposal: !!proposal,
  })
}

export type RunCopilotLLMWithToolResultInput = {
  organizationId: string
  threadId: string
  agentId: string
  toolCallId: string
  toolResult: AskQuestionsResult
  currentConfig: AgentRuntimeConfig
  pendingProposalConfig: AgentRuntimeConfig | null
  resources: ResourceInfo[]
  environmentId: string | null
  initialSeq: number
  modelId?: string
  template?: TemplateInfo | null
}

export async function runCopilotLLMWithToolResult(input: RunCopilotLLMWithToolResultInput) {
  const {
    organizationId,
    threadId,
    agentId,
    toolCallId,
    toolResult,
    currentConfig,
    pendingProposalConfig,
    resources,
    environmentId,
    modelId,
    template,
  } = input
  let currentSeq = input.initialSeq

  let inFlightState: CopilotInFlightState = {
    status: "thinking",
    reasoningText: "",
    streamingText: "",
    toolCalls: [],
  }

  const updateInFlight = async (updates: Partial<NonNullable<CopilotInFlightState>>) => {
    if (!inFlightState) {
      inFlightState = { status: "thinking", reasoningText: "", streamingText: "", toolCalls: [] }
    }
    inFlightState = { ...inFlightState, ...updates }
    await updateAgentCopilotInFlightState({ threadId, state: inFlightState })
  }

  const history = await getAgentCopilotMessageHistory({ threadId, limit: 20 })

  const baseMessages: CopilotMessage[] = history.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const modelConfig = await getModel(modelId)
  const resourcesContext =
    resources.length > 0 ? await buildResourceContext(organizationId, resources, environmentId) : ""

  const pendingProposalSection = pendingProposalConfig
    ? `
<pending-proposal>
There is a pending configuration proposal that has NOT been applied yet.
The user may want to build upon, modify, or refine this proposal.
When the user asks for additional changes, apply them to this pending configuration, not the current configuration.

Pending Configuration:
\`\`\`json
${JSON.stringify(pendingProposalConfig, null, 2)}
\`\`\`
</pending-proposal>
`
    : ""

  const resultSummary = toolResult.answers
    .map((a) => {
      const selections = a.selected.join(", ")
      const other = a.otherText ? ` (Other: ${a.otherText})` : ""
      return `Question ${a.questionIndex + 1}: ${selections}${other}`
    })
    .join("; ")

  const contextPrompt = `
Current Agent Configuration (currently applied):
\`\`\`json
${JSON.stringify(currentConfig, null, 2)}
\`\`\`
${pendingProposalSection}
<available-resources>
${resourcesContext || "No resources configured."}
</available-resources>
User answered questions: ${resultSummary}
`

  const hasDbResources = resources.some((r) => r.type === "postgres" || r.type === "mysql")
  const hasApiResources = resources.some((r) => r.type === "github" || r.type === "stripe" || r.type === "intercom")

  const getTableDetailsTool = tool({
    description: "Get detailed column information for a database table",
    inputSchema: z.object({
      resourceSlug: z.string().describe("The resource slug"),
      tableName: z.string().describe("The table name to get details for"),
    }),
    execute: async (args) => {
      if (!environmentId) return "Error: No environment selected"
      const resource = resources.find((r) => r.slug === args.resourceSlug)
      if (!resource) return `Error: Resource "${args.resourceSlug}" not found`
      const result = await gateway.columns(organizationId, resource.id, environmentId, args.tableName)
      if (!result.ok) return `Error: ${result.error}`
      return formatColumnsForLLM(result.data)
    },
  })

  const getApiEndpointTool = tool({
    description: "Search for API endpoint documentation. Use this to find relevant endpoints for the user's request.",
    inputSchema: z.object({
      resourceSlug: z.string().describe("The resource slug (github, stripe, or intercom)"),
      searchQuery: z.string().describe("What to search for (e.g. 'list repositories', 'create customer')"),
    }),
    execute: async (args) => {
      const resource = resources.find((r) => r.slug === args.resourceSlug)
      if (!resource) return `Error: Resource "${args.resourceSlug}" not found`
      const resourceType = resource.type as "github" | "stripe" | "intercom"
      const searchResults = await searchEndpointsWithLLM(resourceType, args.searchQuery)
      return formatSearchResultsForLLM(searchResults)
    },
  })

  const submitConfigTool = tool({
    description:
      "Submit a configuration change proposal for the agent. Call this tool when the user requests changes to the agent configuration.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        explanation: { type: "string", description: "Clear explanation of what changes you made and why" },
        config: {
          type: "object",
          description: "Complete AgentRuntimeConfig object",
          properties: {
            model: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["openai", "anthropic", "google"] },
                model: { type: "string" },
                temperature: { type: "number" },
                topP: { type: "number" },
                reasoning: {
                  type: "object",
                  properties: {
                    effort: { type: "string", enum: ["low", "medium", "high", "xhigh"] },
                    budgetTokens: { type: "number" },
                  },
                },
              },
              required: ["provider", "model", "temperature"],
            },
            systemPrompt: { type: "string" },
            tools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  params: { type: "object" },
                  returns: { type: "object" },
                  code: { type: "string" },
                  timeoutMs: { type: "number" },
                  requiresReview: { type: "boolean" },
                  approvalAuthority: { type: "string", enum: ["owner_only", "any_member"] },
                  selfApproval: { type: "boolean" },
                  approvalTimeoutMs: { type: "number" },
                },
                required: ["name", "description", "params", "returns", "code"],
              },
            },
            subagents: {
              type: "array",
              description: "Subagents that can be delegated to. Each creates a delegate_to_{alias} tool.",
              items: {
                type: "object",
                properties: {
                  agentId: { type: "string", description: "ID of the agent to delegate to" },
                  alias: { type: "string", description: "Alias for the delegation tool name (delegate_to_{alias})" },
                  description: {
                    type: "string",
                    description: "Description shown to the LLM for when to use this subagent",
                  },
                  versionMode: {
                    type: "string",
                    enum: ["current", "fixed"],
                    description: "Whether to use current or fixed version",
                  },
                  releaseId: { type: "string", description: "Release ID when versionMode is fixed" },
                },
                required: ["agentId", "description", "versionMode"],
              },
            },
            $defs: { type: "object", description: "Reusable type definitions" },
            maxIterations: { type: "number" },
            maxToolCallsPerIteration: { type: "number" },
            maxActiveTimeMs: { type: "number" },
          },
          required: ["model", "systemPrompt", "tools"],
        },
      },
      required: ["explanation", "config"],
    } as JSONSchema7),
  })

  const requestResourceConnectionTool = tool({
    description:
      "Request the user to connect a new resource. Call this tool ONCE per turn for ONE category of resource.",
    inputSchema: z.object({
      explanation: z.string().describe("Why this specific category of resource is needed"),
      suggestions: z
        .array(
          z.object({
            type: z.enum(UserConfigurableResourceType),
            reason: z.string().describe("Why this specific option would work"),
          }),
        )
        .min(1)
        .max(3),
    }),
  })

  const askQuestionsTool = tool({
    description:
      "Ask the user questions with predefined options. Use this instead of asking text questions.\n" +
      "- Present 1-4 questions at a time\n" +
      "- Each question has 2-4 options with label and description\n" +
      "- 'Other' option is automatically added for custom text input\n" +
      "- Use multiSelect: true when multiple options can be selected",
    inputSchema: z.object({
      questions: z
        .array(
          z.object({
            question: z.string().describe("The question to ask the user"),
            header: z.string().max(12).describe("Short label for the question (max 12 chars)"),
            options: z
              .array(
                z.object({
                  label: z.string().describe("Short option label (1-5 words)"),
                  description: z.string().describe("Explanation of what this option means"),
                }),
              )
              .min(2)
              .max(4),
            multiSelect: z
              .boolean()
              .describe("true: checkboxes (multiple selections), false: radio buttons (single selection)"),
          }),
        )
        .min(1)
        .max(4),
    }),
  })

  const getTriggersTool = tool({
    description:
      "Get all triggers configured for this agent. Use this to understand existing trigger configurations before creating or updating.",
    inputSchema: z.object({}),
    execute: async () => {
      const triggers = await listTriggers()
      const agentTriggers = triggers.filter((t) => t.agentId === agentId)
      if (agentTriggers.length === 0) return "No triggers configured for this agent."
      return agentTriggers
        .map((t) => {
          const parts = [`Trigger: ${t.name} (${t.slug})`, `  ID: ${t.id}`, `  Type: ${t.type}`, `  Mode: ${t.mode}`]
          if (t.type === "schedule" && t.cron) parts.push(`  Cron: ${t.cron} (${t.timezone})`)
          if (t.type === "app" && t.appEvents) parts.push(`  Events: ${t.appEvents.join(", ")}`)
          if (t.mode === "template" && t.template) parts.push(`  Template: ${t.template.slice(0, 100)}...`)
          return parts.join("\n")
        })
        .join("\n\n")
    },
  })

  const createTriggerTool = tool({
    description:
      "Create a new trigger for this agent. A trigger defines how and when the agent is invoked.\n" +
      "Trigger types:\n" +
      "- webhook: Invoked via HTTP POST request\n" +
      "- schedule: Invoked on a cron schedule\n" +
      "- app: Invoked by app events (e.g., Slack, GitHub)\n\n" +
      "Trigger modes:\n" +
      "- template: Use a template string with {{payload.field}} placeholders\n" +
      "- script: Use JavaScript to transform the payload\n" +
      "- prompt: Use an existing prompt configuration",
    inputSchema: z.object({
      name: z.string().describe("Display name for the trigger"),
      explanation: z.string().describe("Explanation of what this trigger does and why it's being created"),
      type: z.enum(["webhook", "schedule", "app"]).describe("Type of trigger"),
      mode: z.enum(["template", "script", "prompt"]).default("template").describe("How to generate the agent prompt"),
      template: z.string().optional().describe("Template string for template mode"),
      script: z.string().optional().describe("JavaScript code for script mode"),
      cron: z.string().optional().describe("Cron expression for schedule type (e.g., '0 9 * * *' for 9am daily)"),
      timezone: z.string().default("UTC").describe("Timezone for schedule type"),
      appAccountId: z.string().optional().describe("App account ID for app type"),
      appEvents: z.array(z.string()).optional().describe("Event types to listen for in app type"),
    }),
  })

  const updateTriggerTool = tool({
    description:
      "Update an existing trigger's configuration. Only provide the fields you want to change.\n" +
      "Use get_triggers first to see current configurations and get trigger IDs.",
    inputSchema: z.object({
      triggerId: z.string().describe("The ID of the trigger to update"),
      explanation: z.string().describe("Explanation of what changes are being made and why"),
      name: z.string().optional().describe("New display name for the trigger"),
      type: z.enum(["webhook", "schedule", "app"]).optional().describe("New trigger type"),
      mode: z.enum(["template", "script", "prompt"]).optional().describe("New prompt generation mode"),
      template: z.string().optional().describe("New template string"),
      script: z.string().optional().describe("New JavaScript code"),
      cron: z.string().nullable().optional().describe("New cron expression (null to remove)"),
      timezone: z.string().optional().describe("New timezone"),
      appAccountId: z.string().nullable().optional().describe("New app account ID (null to remove)"),
      appEvents: z.array(z.string()).nullable().optional().describe("New event types (null to remove)"),
    }),
  })

  const allTools = {
    submit_config: submitConfigTool,
    request_resource_connection: requestResourceConnectionTool,
    ask_questions: askQuestionsTool,
    get_triggers: getTriggersTool,
    create_trigger: createTriggerTool,
    update_trigger: updateTriggerTool,
    ...(hasDbResources ? { get_table_details: getTableDetailsTool } : {}),
    ...(hasApiResources ? { get_api_endpoint: getApiEndpointTool } : {}),
  }

  let assistantText = ""
  const toolCalls: CopilotToolCall[] = []
  let proposal: { id: string; config: AgentRuntimeConfig; explanation: string } | null = null
  let resourceRequest: { explanation: string; suggestions: { type: string; reason: string }[] } | null = null
  let questionRequest: { toolCallId: string; questions: CopilotQuestion[] } | null = null
  let triggerRequest: {
    action: "create" | "update"
    triggerId?: string
    explanation: string
    config: CopilotTriggerConfig
  } | null = null
  let validationError: string | null = null

  const conversationMessages: ModelMessage[] = [
    ...baseMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: contextPrompt },
  ]

  console.log("[Copilot] Continuing with tool result", { threadId, toolCallId })

  try {
    const result = streamText({
      model: modelConfig.model,
      system: buildCopilotSystemPrompt(resources, template),
      messages: conversationMessages,
      tools: allTools,
      stopWhen: [
        hasToolCall("ask_questions"),
        hasToolCall("submit_config"),
        hasToolCall("request_resource_connection"),
        hasToolCall("create_trigger"),
        hasToolCall("update_trigger"),
      ],
      temperature: 0.7,
      onChunk: async ({ chunk }) => {
        if (chunk.type === "tool-input-start") {
          currentSeq++
          await emitCopilotEvent({
            threadId,
            seq: currentSeq,
            type: "copilot.tool_call.streaming_start",
            data: { toolCallId: chunk.id, toolName: chunk.toolName },
          })
          const newToolCalls: InFlightToolCall[] = [
            ...(inFlightState?.toolCalls ?? []),
            { toolCallId: chunk.id, toolName: chunk.toolName, argsText: "", status: "streaming" },
          ]
          await updateInFlight({ status: "tool_call", toolCalls: newToolCalls })
        } else if (chunk.type === "tool-input-delta") {
          currentSeq++
          await emitCopilotEvent({
            threadId,
            seq: currentSeq,
            type: "copilot.tool_call.input_delta",
            data: { toolCallId: chunk.id, delta: chunk.delta },
          })
          const newToolCalls = (inFlightState?.toolCalls ?? []).map((tc) =>
            tc.toolCallId === chunk.id ? { ...tc, argsText: tc.argsText + chunk.delta } : tc,
          )
          await updateInFlight({ toolCalls: newToolCalls })
        } else if (chunk.type === "tool-call") {
          currentSeq++
          await emitCopilotEvent({
            threadId,
            seq: currentSeq,
            type: "copilot.tool_call.executing",
            data: { toolCallId: chunk.toolCallId, toolName: chunk.toolName },
          })
          toolCalls.push({
            id: chunk.toolCallId,
            name: chunk.toolName,
            args: chunk.input as Record<string, unknown>,
            result: undefined,
          })
          const newToolCalls = (inFlightState?.toolCalls ?? []).map((tc) =>
            tc.toolCallId === chunk.toolCallId ? { ...tc, status: "executing" as const } : tc,
          )
          await updateInFlight({ toolCalls: newToolCalls })
        } else if (chunk.type === "tool-result") {
          const existing = toolCalls.find((tc) => tc.id === chunk.toolCallId)
          if (existing && "output" in chunk) existing.result = chunk.output
          currentSeq++
          await emitCopilotEvent({
            threadId,
            seq: currentSeq,
            type: "copilot.tool_call.done",
            data: { toolCallId: chunk.toolCallId, toolName: chunk.toolName },
          })
          const newToolCalls = (inFlightState?.toolCalls ?? []).map((tc) =>
            tc.toolCallId === chunk.toolCallId ? { ...tc, status: "completed" as const } : tc,
          )
          await updateInFlight({ toolCalls: newToolCalls })
        } else if (chunk.type === "text-delta") {
          currentSeq++
          await emitCopilotEvent({ threadId, seq: currentSeq, type: "copilot.text_delta", data: { delta: chunk.text } })
          const newStreamingText = (inFlightState?.streamingText ?? "") + chunk.text
          await updateInFlight({ status: "streaming", streamingText: newStreamingText })
        }
      },
    })

    assistantText = await result.text
    const allToolResults = await result.toolResults
    const toolResultsMap = new Map<string, unknown>()
    for (const tr of allToolResults) {
      if (tr && "toolCallId" in tr) toolResultsMap.set(tr.toolCallId, "result" in tr ? tr.result : tr)
    }

    const currentToolCalls = await result.toolCalls
    for (const tc of currentToolCalls) {
      if (!tc) continue
      const toolResultVal = toolResultsMap.get(tc.toolCallId)
      const existing = toolCalls.find((t) => t.id === tc.toolCallId)
      if (existing) {
        existing.result = toolResultVal
      } else {
        toolCalls.push({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.input as Record<string, unknown>,
          result: toolResultVal,
        })
      }

      if (tc.toolName === "submit_config") {
        const args = tc.input as { explanation: string; config: Record<string, unknown> | string }
        const validateResult = validateSubmitConfig(args)
        if (validateResult.ok) {
          proposal = { id: "", config: validateResult.config, explanation: validateResult.explanation }
        } else {
          validationError = validateResult.error
        }
      }

      if (tc.toolName === "request_resource_connection") {
        const args = tc.input as { explanation: string; suggestions: { type: string; reason: string }[] }
        resourceRequest = { explanation: args.explanation, suggestions: args.suggestions }
      }

      if (tc.toolName === "ask_questions") {
        const args = tc.input as { questions: CopilotQuestion[] }
        questionRequest = { toolCallId: tc.toolCallId, questions: args.questions }
      }

      if (tc.toolName === "create_trigger") {
        const args = tc.input as {
          name: string
          explanation: string
          type: TriggerType
          mode?: TriggerMode
          template?: string
          script?: string
          cron?: string
          timezone?: string
          appAccountId?: string
          appEvents?: string[]
        }
        triggerRequest = {
          action: "create",
          explanation: args.explanation,
          config: {
            name: args.name,
            type: args.type,
            mode: args.mode,
            template: args.template,
            script: args.script,
            cron: args.cron,
            timezone: args.timezone,
            appAccountId: args.appAccountId,
            appEvents: args.appEvents,
          },
        }
      }

      if (tc.toolName === "update_trigger") {
        const args = tc.input as {
          triggerId: string
          explanation: string
          name?: string
          type?: TriggerType
          mode?: TriggerMode
          template?: string
          script?: string
          cron?: string | null
          timezone?: string
          appAccountId?: string | null
          appEvents?: string[] | null
        }
        triggerRequest = {
          action: "update",
          triggerId: args.triggerId,
          explanation: args.explanation,
          config: {
            name: args.name,
            type: args.type,
            mode: args.mode,
            template: args.template,
            script: args.script,
            cron: args.cron,
            timezone: args.timezone,
            appAccountId: args.appAccountId,
            appEvents: args.appEvents,
          },
        }
      }
    }
  } catch (error) {
    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.error",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    })
    await updateAgentCopilotInFlightState({ threadId, state: null, seq: currentSeq })
    return
  }

  let messageContent = assistantText || (proposal ? proposal.explanation : "")
  if (validationError)
    messageContent = messageContent ? `${messageContent}\n\n[Error] ${validationError}` : `[Error] ${validationError}`

  const assistantMessage = await createAgentCopilotMessage({
    threadId,
    role: "assistant",
    content: messageContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  })

  if (proposal) {
    const createdProposal = await createAgentCopilotProposalAndRejectPending({
      threadId,
      messageId: assistantMessage.id,
      config: proposal!.config,
      explanation: proposal!.explanation,
    })
    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.proposal.created",
      data: {
        proposal: {
          id: createdProposal.id,
          config: createdProposal.config,
          explanation: createdProposal.explanation,
          status: createdProposal.status,
        },
      },
    })
  }

  if (resourceRequest) {
    const createdRequest = await createAgentCopilotResourceRequest({
      threadId,
      messageId: assistantMessage.id,
      explanation: resourceRequest.explanation,
      suggestions: resourceRequest.suggestions as {
        type: "postgres" | "mysql" | "stripe" | "github" | "intercom" | "restapi"
        reason: string
      }[],
    })
    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.resource_request.created",
      data: {
        resourceRequest: {
          id: createdRequest.id,
          explanation: createdRequest.explanation,
          suggestions: createdRequest.suggestions,
          status: createdRequest.status,
        },
      },
    })
  }

  if (questionRequest) {
    const createdQuestionRequest = await createAgentCopilotQuestionRequest({
      threadId,
      messageId: assistantMessage.id,
      toolCallId: questionRequest.toolCallId,
      questions: questionRequest.questions,
    })

    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.questions.rendered",
      data: {
        id: createdQuestionRequest.id,
        toolCallId: createdQuestionRequest.toolCallId,
        questions: createdQuestionRequest.questions,
      },
    })
  }

  if (triggerRequest) {
    const createdTriggerRequest = await createAgentCopilotTriggerRequest({
      threadId,
      messageId: assistantMessage.id,
      action: triggerRequest.action,
      triggerId: triggerRequest.triggerId,
      explanation: triggerRequest.explanation,
      config: triggerRequest.config,
    })

    currentSeq++
    await emitCopilotEvent({
      threadId,
      seq: currentSeq,
      type: "copilot.trigger_request.created",
      data: {
        triggerRequest: {
          id: createdTriggerRequest.id,
          action: createdTriggerRequest.action,
          triggerId: createdTriggerRequest.triggerId,
          explanation: createdTriggerRequest.explanation,
          config: createdTriggerRequest.config,
          status: createdTriggerRequest.status,
        },
      },
    })
  }

  currentSeq++
  await emitCopilotEvent({
    threadId,
    seq: currentSeq,
    type: "copilot.message.created",
    data: { message: assistantMessage },
  })

  const waitingForQuestions = questionRequest !== null
  if (!waitingForQuestions) {
    currentSeq++
    await emitCopilotEvent({ threadId, seq: currentSeq, type: "copilot.completed", data: {} })
  }

  await updateAgentCopilotInFlightState({
    threadId,
    state: waitingForQuestions ? inFlightState : null,
    seq: currentSeq,
  })

  console.log("[Copilot] Tool result request completed", {
    threadId,
    toolCallCount: toolCalls.length,
    hasProposal: !!proposal,
  })
}
