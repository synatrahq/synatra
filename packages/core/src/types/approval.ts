export const ApprovalStatus = ["pending", "approved", "rejected", "timeout"] as const
export type ApprovalStatus = (typeof ApprovalStatus)[number]

export type ApprovalAction = {
  name: string
  params: Record<string, unknown>
  reason: string
}
