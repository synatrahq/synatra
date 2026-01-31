import { z } from "zod"

export const RecipeStepType = ["query", "code", "output", "input"] as const
export type RecipeStepType = (typeof RecipeStepType)[number]

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

const JsonSchemaSchema = z.record(z.string(), z.unknown())

export const QueryStepConfigSchema = z.object({
  description: z.string(),
  params: JsonSchemaSchema,
  returns: JsonSchemaSchema,
  code: z.string(),
  timeoutMs: z.number().int().min(100).max(60000).optional(),
  binding: ParamBindingSchema,
})
export type QueryStepConfig = z.infer<typeof QueryStepConfigSchema>

export const CodeStepConfigSchema = z.object({
  code: z.string(),
  timeoutMs: z.number().int().min(100).max(30000).optional(),
  binding: ParamBindingSchema,
})
export type CodeStepConfig = z.infer<typeof CodeStepConfigSchema>

export const OutputStepKind = ["table", "chart", "markdown", "key_value"] as const
export type OutputStepKind = (typeof OutputStepKind)[number]

export const OutputStepConfigSchema = z.object({
  kind: z.enum(OutputStepKind),
  name: z.string().optional(),
  binding: ParamBindingSchema,
})
export type OutputStepConfig = z.infer<typeof OutputStepConfigSchema>

export const InputStepFieldKind = ["form", "select_rows", "question"] as const
export type InputStepFieldKind = (typeof InputStepFieldKind)[number]

export const InputStepFormFieldSchema = z.object({
  kind: z.literal("form"),
  key: z.string(),
  schema: z.record(z.string(), z.unknown()),
  defaults: z.record(z.string(), z.unknown()).optional(),
})
export type InputStepFormField = z.infer<typeof InputStepFormFieldSchema>

export const InputStepSelectRowsFieldSchema = z.object({
  kind: z.literal("select_rows"),
  key: z.string(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  dataBinding: ParamBindingSchema,
  selectionMode: z.enum(["single", "multiple"]),
  allowNone: z.boolean().optional(),
})
export type InputStepSelectRowsField = z.infer<typeof InputStepSelectRowsFieldSchema>

export const InputStepQuestionFieldSchema = z.object({
  kind: z.literal("question"),
  key: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      header: z.string(),
      options: z.array(z.object({ label: z.string(), description: z.string() })),
      multiSelect: z.boolean().optional(),
    }),
  ),
})
export type InputStepQuestionField = z.infer<typeof InputStepQuestionFieldSchema>

export const InputStepFieldConfigSchema = z.discriminatedUnion("kind", [
  InputStepFormFieldSchema,
  InputStepSelectRowsFieldSchema,
  InputStepQuestionFieldSchema,
])
export type InputStepFieldConfig = z.infer<typeof InputStepFieldConfigSchema>

export const InputStepConfigSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(InputStepFieldConfigSchema),
})
export type InputStepConfig = z.infer<typeof InputStepConfigSchema>

export type RecipeStepConfig = QueryStepConfig | CodeStepConfig | OutputStepConfig | InputStepConfig

export const RecipeStepConfigSchema = z.union([
  QueryStepConfigSchema,
  CodeStepConfigSchema,
  OutputStepConfigSchema,
  InputStepConfigSchema,
])

export const RecipeStepSchema = z
  .object({
    stepKey: z.string(),
    label: z.string(),
    dependsOn: z.array(z.string()),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("query"), config: QueryStepConfigSchema }),
      z.object({ type: z.literal("code"), config: CodeStepConfigSchema }),
      z.object({ type: z.literal("output"), config: OutputStepConfigSchema }),
      z.object({ type: z.literal("input"), config: InputStepConfigSchema }),
    ]),
  )
export type RecipeStep = z.infer<typeof RecipeStepSchema>

export const RecipeInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["string", "number"]),
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
