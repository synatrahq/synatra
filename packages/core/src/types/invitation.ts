export const InvitationStatus = ["pending", "accepted", "rejected", "canceled", "expired"] as const
export type InvitationStatus = (typeof InvitationStatus)[number]
