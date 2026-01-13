import { listMessagesByThread, listRunsByThread } from "@synatra/core"
import type { ConversationMessage } from "./call-llm"

export interface LoadThreadMessagesInput {
  threadId: string
}

export interface LoadThreadMessagesResult {
  messages: ConversationMessage[]
}

export async function loadThreadMessages(input: LoadThreadMessagesInput): Promise<LoadThreadMessagesResult> {
  const { threadId } = input

  const allMessages = await listMessagesByThread(threadId)
  const runs = await listRunsByThread(threadId)
  const rootRunIds = new Set(runs.filter((r) => r.depth === 0).map((r) => r.id))
  const messages = allMessages.filter((m) => !m.runId || rootRunIds.has(m.runId))

  const result: ConversationMessage[] = []
  const toolCallMap = new Map<string, string>()

  for (const msg of messages) {
    if (msg.type === "tool_call" && msg.toolCall) {
      toolCallMap.set(msg.toolCall.id, msg.toolCall.name)
    }
  }

  for (const msg of messages) {
    if (msg.type === "user" && msg.content) {
      result.push({ role: "user", content: msg.content, messageId: msg.id })
    } else if (msg.type === "assistant") {
      result.push({
        role: "assistant",
        content: msg.content ?? "",
        toolCalls: msg.toolCall
          ? [{ id: msg.toolCall.id, name: msg.toolCall.name, params: msg.toolCall.params }]
          : undefined,
      })
    } else if (msg.type === "tool_call" && msg.toolCall) {
      const lastMessage = result[result.length - 1]
      if (lastMessage && lastMessage.role === "assistant") {
        lastMessage.toolCalls = lastMessage.toolCalls ?? []
        lastMessage.toolCalls.push({
          id: msg.toolCall.id,
          name: msg.toolCall.name,
          params: msg.toolCall.params,
        })
      } else {
        result.push({
          role: "assistant",
          content: "",
          toolCalls: [{ id: msg.toolCall.id, name: msg.toolCall.name, params: msg.toolCall.params }],
        })
      }
    } else if (msg.type === "tool_result" && msg.toolResult) {
      const toolName = toolCallMap.get(msg.toolResult.toolCallId) ?? ""
      result.push({
        role: "tool",
        toolCallId: msg.toolResult.toolCallId,
        toolName,
        result: JSON.stringify(msg.toolResult.result ?? msg.toolResult.error ?? ""),
      })
    }
  }

  return { messages: result }
}
