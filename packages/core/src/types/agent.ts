import { z } from "zod"
import { validateJsonSchema, validateJsonSchemaForProvider, ValidJsonSchemaTypes } from "@synatra/util/validate"
import { isSystemTool } from "../system-tools"

const JsonSchemaSchema = z.record(z.string(), z.unknown())

export const ModelProvider = ["openai", "anthropic", "google"] as const
export type ModelProvider = (typeof ModelProvider)[number]

export const ReasoningConfigSchema = z.object({
  effort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  budgetTokens: z.number().int().positive().optional(),
  level: z.enum(["low", "high"]).optional(),
  budget: z.number().positive().optional(),
})
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>

export const AgentModelConfigSchema = z.object({
  provider: z.enum(ModelProvider),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1).optional(),
  reasoning: ReasoningConfigSchema.optional(),
})
export type AgentModelConfig = z.infer<typeof AgentModelConfigSchema>

export const TypeDefSchema = z.object({
  type: z.enum(ValidJsonSchemaTypes),
  properties: z.record(z.string(), JsonSchemaSchema).optional(),
  items: JsonSchemaSchema.optional(),
  required: z.array(z.string()).optional(),
})
export type TypeDef = z.infer<typeof TypeDefSchema>

export const ApprovalAuthority = ["owner_only", "any_member"] as const
export type ApprovalAuthority = (typeof ApprovalAuthority)[number]

export const AgentToolSchema = z.object({
  stableId: z.string().optional(),
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/,
      "Tool name must start with a letter or underscore and contain only letters, numbers, and underscores",
    ),
  description: z.string(),
  params: JsonSchemaSchema,
  returns: JsonSchemaSchema,
  code: z.string(),
  timeoutMs: z.number().int().min(100).max(60000).optional(),
  requiresReview: z.boolean().optional(),
  approvalAuthority: z.enum(ApprovalAuthority).optional(),
  selfApproval: z.boolean().optional(),
  approvalTimeoutMs: z.number().int().min(60000).max(31536000000).optional(),
})
export type AgentTool = z.infer<typeof AgentToolSchema>

export const SubagentDefinitionSchema = z.object({
  agentId: z.string(),
  alias: z.string().optional(),
  description: z.string(),
  versionMode: z.enum(["current", "fixed"]),
  releaseId: z.string().optional(),
})
export type SubagentDefinition = z.infer<typeof SubagentDefinitionSchema>

export const AgentRuntimeConfigSchema = z
  .object({
    model: AgentModelConfigSchema,
    systemPrompt: z.string(),
    $defs: z.record(z.string(), TypeDefSchema).optional(),
    tools: z.array(AgentToolSchema),
    subagents: z.array(SubagentDefinitionSchema).optional(),
    maxIterations: z.number().int().positive().optional(),
    maxToolCallsPerIteration: z.number().int().positive().optional(),
    maxActiveTimeMs: z.number().int().min(30000).max(3600000).optional(),
    humanRequestTimeoutMs: z.number().int().min(3600000).max(604800000).optional(),
  })
  .superRefine((config, ctx) => {
    if (!config.model || !config.tools) {
      return
    }

    const provider = config.model.provider

    if (config.$defs) {
      for (const [key, schema] of Object.entries(config.$defs)) {
        const result = validateJsonSchema(schema)
        if (!result.valid) {
          for (const error of result.errors) {
            ctx.addIssue({
              code: "custom",
              path: ["$defs", key],
              message: `Invalid JSON Schema at $defs.${key}: ${error}`,
            })
          }
        }

        const providerResult = validateJsonSchemaForProvider(schema, provider)
        if (!providerResult.valid) {
          for (const error of providerResult.errors) {
            ctx.addIssue({
              code: "custom",
              path: ["$defs", key],
              message: `Unsupported JSON Schema for ${provider} at $defs.${key}: ${error}`,
            })
          }
        }
      }
    }

    for (let i = 0; i < config.tools.length; i++) {
      const tool = config.tools[i]
      if (isSystemTool(tool.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["tools", i, "name"],
          message: `Tool name "${tool.name}" is reserved for system tools`,
        })
        continue
      }
      const paramsResult = validateJsonSchema(tool.params)
      if (!paramsResult.valid) {
        for (const error of paramsResult.errors) {
          ctx.addIssue({
            code: "custom",
            path: ["tools", i, "params"],
            message: `Invalid JSON Schema for tool "${tool.name}" params: ${error}`,
          })
        }
      }

      const returnsResult = validateJsonSchema(tool.returns)
      if (!returnsResult.valid) {
        for (const error of returnsResult.errors) {
          ctx.addIssue({
            code: "custom",
            path: ["tools", i, "returns"],
            message: `Invalid JSON Schema for tool "${tool.name}" returns: ${error}`,
          })
        }
      }

      const paramsProviderResult = validateJsonSchemaForProvider(tool.params, provider)
      if (!paramsProviderResult.valid) {
        for (const error of paramsProviderResult.errors) {
          ctx.addIssue({
            code: "custom",
            path: ["tools", i, "params"],
            message: `Unsupported JSON Schema for ${provider} tool "${tool.name}" params: ${error}`,
          })
        }
      }

      const returnsProviderResult = validateJsonSchemaForProvider(tool.returns, provider)
      if (!returnsProviderResult.valid) {
        for (const error of returnsProviderResult.errors) {
          ctx.addIssue({
            code: "custom",
            path: ["tools", i, "returns"],
            message: `Unsupported JSON Schema for ${provider} tool "${tool.name}" returns: ${error}`,
          })
        }
      }
    }
  })
export type AgentRuntimeConfig = z.infer<typeof AgentRuntimeConfigSchema>

export type ToolCallRecord = {
  id: string
  name: string
  params: Record<string, unknown>
}
