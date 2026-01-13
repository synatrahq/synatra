import type { MiddlewareHandler } from "hono"
import { createError } from "@synatra/util/error"
import { verifyToken, type TokenPayload } from "./token"

declare module "hono" {
  interface ContextVariableMap {
    caller: TokenPayload
    organizationId: string | undefined
  }
}

export function serviceAuth(secret: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path === "/health" && c.req.method === "GET") {
      return next()
    }

    const header = c.req.header("Authorization")
    if (!header?.startsWith("Bearer ")) {
      throw createError("UnauthorizedError", { message: "Missing token" })
    }

    const token = header.slice(7)
    const payload = await verifyToken(secret, token)

    if (!payload) {
      throw createError("UnauthorizedError", { message: "Invalid or expired token" })
    }

    c.set("caller", payload)
    c.set("organizationId", payload.org)
    return next()
  }
}
