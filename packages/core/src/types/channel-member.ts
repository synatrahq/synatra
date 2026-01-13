export const ChannelMemberRole = ["owner", "member"] as const
export type ChannelMemberRole = (typeof ChannelMemberRole)[number]
