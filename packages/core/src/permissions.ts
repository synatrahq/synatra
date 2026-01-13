import { createAccessControl } from "better-auth/plugins/access"

export const permissionStatement = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  agent: ["create", "update", "delete"],
  channel: ["create", "update", "delete"],
  connector: ["create", "delete"],
  environment: ["create", "update", "delete"],
  resource: ["read", "create", "update", "delete"],
  prompt: ["create", "update", "delete"],
  trigger: ["create", "update", "delete"],
  schedule: ["create", "update", "delete"],
} as const

export type PermissionStatement = typeof permissionStatement
export type PermissionResource = keyof PermissionStatement
export type PermissionAction<R extends PermissionResource> = PermissionStatement[R][number]

export const ac = createAccessControl(permissionStatement)

export const ownerRole = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  agent: ["create", "update", "delete"],
  channel: ["create", "update", "delete"],
  connector: ["create", "delete"],
  environment: ["create", "update", "delete"],
  resource: ["read", "create", "update", "delete"],
  prompt: ["create", "update", "delete"],
  trigger: ["create", "update", "delete"],
  schedule: ["create", "update", "delete"],
})

export const adminRole = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  agent: ["create", "update", "delete"],
  channel: ["create", "update", "delete"],
  connector: ["create", "delete"],
  environment: ["create", "update", "delete"],
  resource: ["read", "create", "update", "delete"],
  prompt: ["create", "update", "delete"],
  trigger: ["create", "update", "delete"],
  schedule: ["create", "update", "delete"],
})

export const builderRole = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  agent: ["create", "update", "delete"],
  channel: [],
  connector: [],
  environment: [],
  resource: ["read", "create", "update", "delete"],
  prompt: ["create", "update", "delete"],
  trigger: ["create", "update", "delete"],
  schedule: ["create", "update", "delete"],
})

export const memberRole = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  agent: [],
  channel: [],
  connector: [],
  environment: [],
  resource: [],
  prompt: [],
  trigger: [],
  schedule: [],
})

export type Role = "owner" | "admin" | "builder" | "member"
