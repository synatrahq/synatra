export const MAX_SUBAGENT_DEPTH = 1

export type SystemToolType = "task_complete"

export type CompleteParams = {
  summary: string
}

export type SystemToolCall = { name: "task_complete"; params: CompleteParams }
