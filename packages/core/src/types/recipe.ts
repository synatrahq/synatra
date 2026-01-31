import { z } from "zod"

export const RecipeStepType = ["query", "code", "output", "input"] as const
export type RecipeStepType = (typeof RecipeStepType)[number]

const LiteralBindingSchema = z.object({
  type: z.literal("literal"),
  value: z.unknown(),
})

const RefBindingSchema = z.object({
  type: z.literal("ref"),
  scope: z.enum(["input", "step"]),
  key: z.string(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  as: z.enum(["string", "number", "boolean", "object", "array"]).optional(),
})

const TemplateBindingSchema: z.ZodType<TemplateBinding> = z.lazy(() =>
  z.object({
    type: z.literal("template"),
    parts: z.array(z.union([z.string(), ParamBindingSchema])),
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
  LiteralBindingSchema,
  RefBindingSchema,
  TemplateBindingSchema,
  ObjectBindingSchema,
  ArrayBindingSchema,
])

export type LiteralBinding = z.infer<typeof LiteralBindingSchema>
export type RefBinding = z.infer<typeof RefBindingSchema>
export type TemplateBinding = {
  type: "template"
  parts: Array<string | ParamBinding>
}
export type ObjectBinding = {
  type: "object"
  entries: Record<string, ParamBinding>
}
export type ArrayBinding = {
  type: "array"
  items: ParamBinding[]
}

export type ParamBinding = LiteralBinding | RefBinding | TemplateBinding | ObjectBinding | ArrayBinding
export type Value = ParamBinding

const JsonSchemaSchema = z.record(z.string(), z.unknown())

export const QueryStepConfigSchema = z.object({
  description: z.string(),
  paramSchema: JsonSchemaSchema,
  returnSchema: JsonSchemaSchema,
  code: ParamBindingSchema,
  timeoutMs: ParamBindingSchema.optional(),
  params: ParamBindingSchema,
})
export type QueryStepConfig = z.infer<typeof QueryStepConfigSchema>

export const CodeStepConfigSchema = z.object({
  code: ParamBindingSchema,
  timeoutMs: ParamBindingSchema.optional(),
  params: ParamBindingSchema,
})
export type CodeStepConfig = z.infer<typeof CodeStepConfigSchema>

export const OutputStepKind = ["table", "chart", "markdown", "key_value"] as const
export type OutputStepKind = (typeof OutputStepKind)[number]

export const OutputStepConfigSchema = z.object({
  kind: z.enum(OutputStepKind),
  name: ParamBindingSchema.optional(),
  params: ParamBindingSchema,
})
export type OutputStepConfig = z.infer<typeof OutputStepConfigSchema>

export const InputStepFieldKind = ["form", "select_rows", "question"] as const
export type InputStepFieldKind = (typeof InputStepFieldKind)[number]

export const InputStepFormFieldSchema = z
  .object({
    kind: ParamBindingSchema,
    key: ParamBindingSchema,
    schema: ParamBindingSchema,
    defaults: ParamBindingSchema.optional(),
  })
  .catchall(ParamBindingSchema)
export type InputStepFormField = z.infer<typeof InputStepFormFieldSchema>

export const InputStepSelectRowsFieldSchema = z
  .object({
    kind: ParamBindingSchema,
    key: ParamBindingSchema,
    columns: ParamBindingSchema,
    data: ParamBindingSchema,
    selectionMode: ParamBindingSchema,
    allowNone: ParamBindingSchema.optional(),
  })
  .catchall(ParamBindingSchema)
export type InputStepSelectRowsField = z.infer<typeof InputStepSelectRowsFieldSchema>

export const InputStepQuestionFieldSchema = z
  .object({
    kind: ParamBindingSchema,
    key: ParamBindingSchema,
    questions: ParamBindingSchema,
  })
  .catchall(ParamBindingSchema)
export type InputStepQuestionField = z.infer<typeof InputStepQuestionFieldSchema>

export const InputStepFieldConfigSchema = z.union([
  InputStepFormFieldSchema,
  InputStepSelectRowsFieldSchema,
  InputStepQuestionFieldSchema,
])
export type InputStepFieldConfig = z.infer<typeof InputStepFieldConfigSchema>

export const InputStepConfigSchema = z.object({
  params: z.object({
    title: ParamBindingSchema,
    description: ParamBindingSchema.optional(),
    fields: z.array(InputStepFieldConfigSchema),
  }),
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
