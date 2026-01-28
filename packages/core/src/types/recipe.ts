import { z } from "zod"

export const RecipeExecutionStatus = ["pending", "running", "waiting_input", "completed", "failed"] as const
export type RecipeExecutionStatus = (typeof RecipeExecutionStatus)[number]

const StaticBindingSchema = z.object({
  type: z.literal("static"),
  value: z.unknown(),
})

const InputBindingSchema = z.object({
  type: z.literal("input"),
  inputKey: z.string(),
})

const StepBindingSchema = z.object({
  type: z.literal("step"),
  stepId: z.string(),
  path: z.string().optional(),
})

const TemplateBindingSchema: z.ZodType<TemplateBinding> = z.lazy(() =>
  z.object({
    type: z.literal("template"),
    template: z.string(),
    variables: z.record(z.string(), ParamBindingSchema),
  }),
)

const ObjectBindingSchema: z.ZodType<ObjectBinding> = z.lazy(() =>
  z.object({
    type: z.literal("object"),
    entries: z.record(z.string(), ParamBindingSchema),
  }),
)

export const ParamBindingSchema: z.ZodType<ParamBinding> = z.union([
  StaticBindingSchema,
  InputBindingSchema,
  StepBindingSchema,
  TemplateBindingSchema,
  ObjectBindingSchema,
])

export type StaticBinding = z.infer<typeof StaticBindingSchema>
export type InputBinding = z.infer<typeof InputBindingSchema>
export type StepBinding = z.infer<typeof StepBindingSchema>
export type TemplateBinding = {
  type: "template"
  template: string
  variables: Record<string, ParamBinding>
}
export type ObjectBinding = {
  type: "object"
  entries: Record<string, ParamBinding>
}

export type ParamBinding = StaticBinding | InputBinding | StepBinding | TemplateBinding | ObjectBinding

export const RecipeStepSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  params: z.record(z.string(), ParamBindingSchema),
  dependsOn: z.array(z.string()),
})
export type RecipeStep = z.infer<typeof RecipeStepSchema>

export const RecipeInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["string", "number", "date", "dateRange", "select"]),
  description: z.string().optional(),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
})
export type RecipeInput = z.infer<typeof RecipeInputSchema>

export const RecipeOutputSchema = z.object({
  stepId: z.string(),
  kind: z.enum(["table", "chart", "markdown", "key_value"]),
  name: z.string().optional(),
})
export type RecipeOutput = z.infer<typeof RecipeOutputSchema>

export const RecipeSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentId: z.string(),
  channelId: z.string().optional(),
  sourceThreadId: z.string().optional(),
  sourceRunId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  inputs: z.array(RecipeInputSchema),
  steps: z.array(RecipeStepSchema),
  outputs: z.array(RecipeOutputSchema),
  createdBy: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Recipe = z.infer<typeof RecipeSchema>

export const PendingInputConfigSchema = z.object({
  stepId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(z.record(z.string(), z.unknown())),
})
export type PendingInputConfig = z.infer<typeof PendingInputConfigSchema>

export const RecipeExecutionSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  organizationId: z.string(),
  environmentId: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  status: z.enum(RecipeExecutionStatus),
  currentStepId: z.string().optional(),
  pendingInputConfig: PendingInputConfigSchema.optional(),
  results: z.record(z.string(), z.unknown()),
  resolvedParams: z.record(z.string(), z.record(z.string(), z.unknown())),
  outputItemIds: z.array(z.string()),
  error: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
})
export type RecipeExecution = z.infer<typeof RecipeExecutionSchema>
