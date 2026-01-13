export const UsageRunType = ["user", "trigger", "subagent"] as const
export type UsageRunType = (typeof UsageRunType)[number]
