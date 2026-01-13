export const MemberRole = ["owner", "admin", "builder", "member"] as const
export type MemberRole = (typeof MemberRole)[number]
