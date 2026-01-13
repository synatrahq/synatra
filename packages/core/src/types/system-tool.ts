export type SystemToolType = "task_complete"

export type CompleteParams = {
  summary: string
}

export type SystemToolCall = { name: "task_complete"; params: CompleteParams }
