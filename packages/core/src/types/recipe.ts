import { z } from "zod"

export const RecipeExecutionStatus = ["pending", "running", "waiting_input", "completed", "failed"] as const
export type RecipeExecutionStatus = (typeof RecipeExecutionStatus)[number]

export const RecipeStepType = ["action", "branch", "loop"] as const
export type RecipeStepType = (typeof RecipeStepType)[number]

export const RecipeExecutionEventType = [
  "started",
  "step_started",
  "step_completed",
  "step_failed",
  "waiting_input",
  "input_received",
  "completed",
  "failed",
] as const
export type RecipeExecutionEventType = (typeof RecipeExecutionEventType)[number]

export const RecipeExecutionErrorSchema = z.object({
  stepId: z.string(),
  toolName: z.string(),
  message: z.string(),
  code: z.string().optional(),
})
export type RecipeExecutionError = z.infer<typeof RecipeExecutionErrorSchema>

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

const ArrayBindingSchema: z.ZodType<ArrayBinding> = z.lazy(() =>
  z.object({
    type: z.literal("array"),
    items: z.array(ParamBindingSchema),
  }),
)

export const ParamBindingSchema: z.ZodType<ParamBinding> = z.union([
  StaticBindingSchema,
  InputBindingSchema,
  StepBindingSchema,
  TemplateBindingSchema,
  ObjectBindingSchema,
  ArrayBindingSchema,
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
export type ArrayBinding = {
  type: "array"
  items: ParamBinding[]
}

export type ParamBinding = StaticBinding | InputBinding | StepBinding | TemplateBinding | ObjectBinding | ArrayBinding

export const RecipeStepSchema = z.object({
  id: z.string(),
  label: z.string(),
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

export const PendingInputConfigSchema = z.object({
  stepKey: z.string(),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(z.record(z.string(), z.unknown())),
})
export type PendingInputConfig = z.infer<typeof PendingInputConfigSchema>
