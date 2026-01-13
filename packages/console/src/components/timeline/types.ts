export type ToolStatus = "running" | "success" | "error" | "rejected"

export type SubagentInfo = {
  name: string
  icon: string | null
  iconColor: string | null
}

export type AgentStatus =
  | { type: "thinking" }
  | { type: "running_tool"; toolName: string }
  | { type: "waiting_subagent"; subagentName: string }
  | { type: "processing" }
  | null

export type AgentInfo = {
  id: string
  name: string
  icon: string | null
  iconColor: string | null
}
