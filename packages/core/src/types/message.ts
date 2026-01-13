import { z } from "zod"

export const MessageType = ["user", "assistant", "tool_call", "tool_result", "system", "error"] as const
export type MessageType = (typeof MessageType)[number]

export const ToolCallDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  params: z.record(z.string(), z.unknown()),
})
export type ToolCallData = z.infer<typeof ToolCallDataSchema>

export const CopilotToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  result: z.unknown().optional(),
})
export type CopilotToolCall = z.infer<typeof CopilotToolCallSchema>

export const ToolResultDataSchema = z.object({
  toolCallId: z.string(),
  result: z.unknown(),
  error: z.string().optional(),
})
export type ToolResultData = z.infer<typeof ToolResultDataSchema>
