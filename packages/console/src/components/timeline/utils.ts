import type { ToolStatus, AgentStatus } from "./types"

type ToolResultLike = {
  toolResult?: {
    result?: unknown
    error?: string | null
  } | null
} | null

export function getToolStatus(result: ToolResultLike): ToolStatus {
  if (!result) return "running"
  if ((result.toolResult?.result as Record<string, unknown> | null)?.approved === false) return "rejected"
  if (result.toolResult?.error) return "error"
  return "success"
}

export function statusText(status: AgentStatus): string | null {
  if (!status) return null
  switch (status.type) {
    case "thinking":
      return "Thinking..."
    case "running_tool":
      return `Running ${status.toolName}...`
    case "waiting_subagent":
      return `Waiting for ${status.subagentName}`
    case "processing":
      return "Processing..."
  }
}

export function formatRelativeTime(date: string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
