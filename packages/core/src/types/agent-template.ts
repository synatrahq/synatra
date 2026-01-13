import { z } from "zod"
import { ResourceType } from "./resource"

export const TemplateCategory = ["support", "analytics", "devops", "finance", "compliance", "workflow"] as const
export type TemplateCategory = (typeof TemplateCategory)[number]

export const DemoWidgetSchema = z.object({
  type: z.enum(["table", "chart", "markdown", "key_value"]),
  id: z.string(),
  title: z.string().optional(),
  table: z
    .object({
      columns: z.array(z.object({ key: z.string(), label: z.string() })),
      data: z.array(z.record(z.string(), z.unknown())),
    })
    .optional(),
  chart: z
    .object({
      type: z.enum(["line", "bar", "pie"]),
      data: z.object({
        labels: z.array(z.string()),
        datasets: z.array(z.object({ label: z.string().optional(), data: z.array(z.number()) })),
      }),
    })
    .optional(),
  markdown: z.object({ content: z.string() }).optional(),
  keyValue: z.object({ pairs: z.record(z.string(), z.unknown()) }).optional(),
})
export type DemoWidget = z.infer<typeof DemoWidgetSchema>

export const DemoQuestionOptionSchema = z.object({ label: z.string(), description: z.string().optional() })
export const DemoQuestionSchema = z.object({
  question: z.string(),
  options: z.array(DemoQuestionOptionSchema),
  multiSelect: z.boolean().optional(),
  selectedIndex: z.number().optional(),
})
export type DemoQuestion = z.infer<typeof DemoQuestionSchema>

export const DemoSelectRowsSchema = z.object({
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  data: z.array(z.record(z.string(), z.unknown())),
  selectedIndices: z.array(z.number()),
})
export type DemoSelectRows = z.infer<typeof DemoSelectRowsSchema>

export const DemoConfirmSchema = z.object({
  message: z.string(),
  variant: z.enum(["info", "warning", "danger"]).optional(),
})
export type DemoConfirm = z.infer<typeof DemoConfirmSchema>

export const DemoStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), text: z.string() }),
  z.object({ type: z.literal("thinking"), duration: z.number() }),
  z.object({ type: z.literal("agent"), text: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), status: z.enum(["running", "success"]) }),
  z.object({ type: z.literal("approval"), action: z.string() }),
  z.object({ type: z.literal("delay"), ms: z.number() }),
  z.object({ type: z.literal("widget"), widget: DemoWidgetSchema }),
  z.object({ type: z.literal("question"), question: DemoQuestionSchema }),
  z.object({ type: z.literal("select_rows"), selectRows: DemoSelectRowsSchema }),
  z.object({ type: z.literal("confirm"), confirm: DemoConfirmSchema }),
])
export type DemoStep = z.infer<typeof DemoStepSchema>

export const DemoScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  sequence: z.array(DemoStepSchema),
})
export type DemoScenario = z.infer<typeof DemoScenarioSchema>

export type AgentTemplate = {
  id: string
  slug: string
  name: string
  description: string
  category: TemplateCategory
  icon: string
  iconColor: string
  prompt: string
  suggestedResources: (typeof ResourceType)[number][]
  demoScenarios: DemoScenario[]
  displayOrder: number
  featured: boolean
}
