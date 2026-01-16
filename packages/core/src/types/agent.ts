import { z } from "zod"
import { validateJsonSchemaTypes, ValidJsonSchemaTypes } from "@synatra/util/validate"

const JsonSchemaSchema = z.record(z.string(), z.unknown()).superRefine((schema, ctx) => {
  const result = validateJsonSchemaTypes(schema)
  if (!result.valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid JSON Schema type "${result.invalidType}" at ${result.path}. Valid types are: ${ValidJsonSchemaTypes.join(", ")}`,
    })
  }
})

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
  description: z.string().min(1),
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

export const AgentRuntimeConfigSchema = z.object({
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
export type AgentRuntimeConfig = z.infer<typeof AgentRuntimeConfigSchema>

export type ToolCallRecord = {
  id: string
  name: string
  params: Record<string, unknown>
}
