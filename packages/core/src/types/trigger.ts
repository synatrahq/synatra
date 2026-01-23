export const TriggerType = ["webhook", "schedule", "app"] as const
export type TriggerType = (typeof TriggerType)[number]

export const TriggerMode = ["prompt", "template", "script"] as const
export type TriggerMode = (typeof TriggerMode)[number]

export const ScheduleMode = ["interval", "cron"] as const
export type ScheduleMode = (typeof ScheduleMode)[number]
