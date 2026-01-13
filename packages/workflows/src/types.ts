import type { ToolCallRecord } from "@synatra/core/types"

export type ConversationMessage =
  | { role: "user"; content: string; messageId?: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCallRecord[] }
  | { role: "tool"; toolCallId: string; toolName: string; result: string }

export interface ResolvedSubagent {
  agentId: string
  alias: string
  description: string
  versionMode: "current" | "fixed"
  releaseId?: string
}

export interface ResolvedLlmConfig {
  apiKey: string
  baseUrl?: string | null
}
