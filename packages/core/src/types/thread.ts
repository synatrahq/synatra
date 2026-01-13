export const ThreadKind = ["thread", "playground"] as const
export type ThreadKind = (typeof ThreadKind)[number]

export const ThreadStatus = [
  "running",
  "waiting_human",
  "completed",
  "failed",
  "cancelled",
  "rejected",
  "skipped",
] as const
export type ThreadStatus = (typeof ThreadStatus)[number]

export const RunStatus = [
  "running",
  "waiting_human",
  "waiting_subagent",
  "completed",
  "failed",
  "cancelled",
  "rejected",
] as const
export type RunStatus = (typeof RunStatus)[number]

export const VersionMode = ["current", "fixed"] as const
export type VersionMode = (typeof VersionMode)[number]

export interface PromptConfigOverride {
  mode: "template" | "script"
  template?: string
  script?: string
  source?: "trigger" | "prompt"
}

export interface PromptReference {
  promptId: string
  promptReleaseId: string
  mode: "template" | "script"
  template?: string
  script?: string
}

export interface ThreadWorkflowInput {
  threadId: string
  agentId: string
  agentReleaseId?: string
  agentVersionMode: VersionMode
  triggerId?: string
  triggerReleaseId?: string
  isDebug?: boolean
  organizationId: string
  environmentId: string
  channelId: string
  subject: string
  message?: string
  initialMessageSaved?: boolean
  messageId?: string
  payload?: Record<string, unknown>
  createdBy?: string
  promptConfigOverride?: PromptConfigOverride
  promptRef?: PromptReference
  promptInput?: Record<string, unknown>
}
