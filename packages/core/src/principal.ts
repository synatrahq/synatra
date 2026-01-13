import { AsyncLocalStorage } from "node:async_hooks"
import { createError } from "@synatra/util/error"

type Kind = "user" | "system" | "public"

type UserPrincipal = {
  kind: "user"
  organizationId: string
  userId: string
  email: string
}

type SystemPrincipal = {
  kind: "system"
  organizationId: string
  actingUserId?: string
}

type PublicPrincipal = {
  kind: "public"
}

export type Principal = UserPrincipal | SystemPrincipal | PublicPrincipal

type Input<K extends Kind> = Omit<Extract<Principal, { kind: K }>, "kind">

const store = new AsyncLocalStorage<Principal>()

function withUser<R>(props: Input<"user">, fn: () => R): R {
  return store.run(Object.freeze({ kind: "user", ...props }) as Principal, fn)
}

function withSystem<R>(props: Input<"system">, fn: () => R): R {
  return store.run(Object.freeze({ kind: "system", ...props }) as Principal, fn)
}

function withPublic<R>(fn: () => R): R {
  return store.run(Object.freeze({ kind: "public" }) as Principal, fn)
}

function current(): Principal | undefined {
  return store.getStore()
}

function require(): Principal {
  const p = store.getStore()
  if (!p) throw createError("MissingPrincipalError", { message: "No principal scope found" })
  return p
}

function requireKind<K extends Kind>(kind: K): Extract<Principal, { kind: K }> {
  const p = require()
  if (p.kind !== kind) throw createError("PrincipalKindMismatchError", { expected: kind, actual: p.kind })
  return p as Extract<Principal, { kind: K }>
}

function orgId(): string {
  const p = require()
  if ("organizationId" in p) return p.organizationId
  throw createError("PrincipalPropertyError", { property: "organizationId", principalKind: p.kind })
}

function userId(): string {
  const p = require()
  if (p.kind === "user") return p.userId
  throw createError("PrincipalPropertyError", { property: "userId", principalKind: p.kind })
}

function actingUserId(): string {
  const p = require()
  if (p.kind === "user") return p.userId
  if (p.kind === "system" && p.actingUserId) return p.actingUserId
  throw createError("PrincipalPropertyError", { property: "actingUserId", principalKind: p.kind })
}

export const principal = {
  withUser,
  withSystem,
  withPublic,
  current,
  require,
  requireKind,
  orgId,
  userId,
  actingUserId,
}
