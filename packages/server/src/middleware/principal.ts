import { createMiddleware } from "hono/factory"
import { principal, type PermissionResource, type PermissionAction } from "@synatra/core"
import { auth } from "../auth"
import { createError } from "@synatra/util/error"

export const principalMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (session?.user) {
    const organizationId = (session.session as any).activeOrganizationId ?? ""

    return principal.withUser(
      {
        userId: session.user.id,
        organizationId,
        email: session.user.email,
      },
      () => next(),
    )
  }

  return principal.withPublic(() => next())
})

export const requireAuth = createMiddleware(async (c, next) => {
  const current = principal.require()
  if (current.kind === "public") {
    throw createError("UnauthorizedError", { message: "Unauthorized" })
  }
  return next()
})

export const requireOrganization = createMiddleware(async (c, next) => {
  const organizationId = principal.orgId()
  if (!organizationId) {
    throw createError("ForbiddenError", { message: "No active organization" })
  }
  return next()
})

export function requirePermission<R extends PermissionResource>(resource: R, action: PermissionAction<R>) {
  return createMiddleware(async (c, next) => {
    const result = await auth.api.hasPermission({
      headers: c.req.raw.headers,
      body: { permission: { [resource]: [action] } },
    })
    if (!result.success) {
      throw createError("ForbiddenError", { message: `Permission denied: ${resource}:${action}` })
    }
    return next()
  })
}
