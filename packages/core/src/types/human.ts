import { z } from "zod"

export const HumanRequestKind = ["form", "select_rows", "confirm", "approval", "question"] as const
export type HumanRequestKind = (typeof HumanRequestKind)[number]

export const HumanRequestStatus = ["pending", "responded", "cancelled", "skipped", "timeout"] as const
export type HumanRequestStatus = (typeof HumanRequestStatus)[number]

export const HumanRequestAuthority = ["any_member", "owner_only"] as const
export type HumanRequestAuthority = (typeof HumanRequestAuthority)[number]

export const HumanRequestFallback = ["skip", "default", "fail"] as const
export type HumanRequestFallback = (typeof HumanRequestFallback)[number]

export const HumanResponseStatus = ["responded", "cancelled", "skipped"] as const
export type HumanResponseStatus = (typeof HumanResponseStatus)[number]

export const HumanRequestFormConfigSchema = z.object({
  kind: z.literal("form"),
  schema: z.record(z.string(), z.unknown()),
  defaults: z.record(z.string(), z.unknown()).optional(),
})
export type HumanRequestFormConfig = z.infer<typeof HumanRequestFormConfigSchema>

export const HumanRequestSelectRowsConfigSchema = z.object({
  kind: z.literal("select_rows"),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  data: z.array(z.record(z.string(), z.unknown())),
  selectionMode: z.enum(["single", "multiple"]),
  allowNone: z.boolean().optional(),
})
export type HumanRequestSelectRowsConfig = z.infer<typeof HumanRequestSelectRowsConfigSchema>

export const HumanRequestConfirmConfigSchema = z.object({
  kind: z.literal("confirm"),
  confirmLabel: z.string().optional(),
  rejectLabel: z.string().optional(),
  variant: z.enum(["info", "warning", "danger"]).optional(),
})
export type HumanRequestConfirmConfig = z.infer<typeof HumanRequestConfirmConfigSchema>

export const HumanRequestApprovalConfigSchema = z.object({
  kind: z.literal("approval"),
  action: z.object({
    name: z.string(),
    params: z.record(z.string(), z.unknown()),
    rationale: z.string().optional(),
  }),
  variant: z.enum(["info", "warning", "danger"]).optional(),
  allowModification: z.boolean().optional(),
})
export type HumanRequestApprovalConfig = z.infer<typeof HumanRequestApprovalConfigSchema>

export const HumanRequestQuestionConfigSchema = z.object({
  kind: z.literal("question"),
  questions: z.array(
    z.object({
      question: z.string(),
      header: z.string(),
      options: z.array(z.object({ label: z.string(), description: z.string() })),
      multiSelect: z.boolean().optional(),
    }),
  ),
})
export type HumanRequestQuestionConfig = z.infer<typeof HumanRequestQuestionConfigSchema>

export const HumanRequestFieldConfigSchema = z.discriminatedUnion("kind", [
  HumanRequestFormConfigSchema.extend({ key: z.string() }),
  HumanRequestSelectRowsConfigSchema.extend({ key: z.string() }),
  HumanRequestConfirmConfigSchema.extend({ key: z.string() }),
  HumanRequestApprovalConfigSchema.extend({ key: z.string() }),
  HumanRequestQuestionConfigSchema.extend({ key: z.string() }),
])
export type HumanRequestFieldConfig = z.infer<typeof HumanRequestFieldConfigSchema>

export const HumanRequestConfigSchema = z.object({
  fields: z.array(HumanRequestFieldConfigSchema),
})
export type HumanRequestConfig = z.infer<typeof HumanRequestConfigSchema>
