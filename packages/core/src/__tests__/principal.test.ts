import { describe, test, expect } from "vitest"
import { principal } from "../principal"
import { createError, isAppError } from "@synatra/util/error"

describe("principal", () => {
  const assertAppError = (fn: () => unknown, name: string) => {
    try {
      fn()
      expect.fail("should have thrown")
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      if (isAppError(e)) {
        expect(e.name).toBe(name)
      }
    }
  }

  describe("require", () => {
    test("throws MissingPrincipalError when no context is set", () => {
      assertAppError(() => principal.require(), "MissingPrincipalError")
    })

    test("returns principal info when context is set", () => {
      const result = principal.withUser({ userId: "user-1", organizationId: "org-1", email: "test@example.com" }, () =>
        principal.require(),
      )
      expect(result.kind).toBe("user")
      if (result.kind !== "user") throw new Error("Expected user principal")
      expect(result.userId).toBe("user-1")
      expect(result.organizationId).toBe("org-1")
      expect(result.email).toBe("test@example.com")
    })
  })

  describe("current", () => {
    test("returns undefined when no context is set", () => {
      expect(principal.current()).toBeUndefined()
    })

    test("returns principal info when context is set", () => {
      const result = principal.withUser({ userId: "user-1", organizationId: "org-1", email: "test@example.com" }, () =>
        principal.current(),
      )
      expect(result).toBeDefined()
      expect(result?.kind).toBe("user")
    })
  })

  describe("withUser", () => {
    test("sets user principal scope", () => {
      const result = principal.withUser(
        { userId: "user-123", organizationId: "org-456", email: "user@example.com" },
        () => {
          const item = principal.require()
          if (item.kind !== "user") throw new Error("Expected user principal")
          return { kind: item.kind, userId: item.userId, organizationId: item.organizationId, email: item.email }
        },
      )

      expect(result.kind).toBe("user")
      expect(result.userId).toBe("user-123")
      expect(result.organizationId).toBe("org-456")
      expect(result.email).toBe("user@example.com")
    })

    test("returns the function result", () => {
      const result = principal.withUser(
        { userId: "u1", organizationId: "o1", email: "e@e.com" },
        () => "computed value",
      )
      expect(result).toBe("computed value")
    })

    test("supports async functions", async () => {
      const result = await principal.withUser({ userId: "u1", organizationId: "o1", email: "e@e.com" }, async () => {
        await new Promise((r) => setTimeout(r, 1))
        return principal.require()
      })
      expect(result.kind).toBe("user")
    })
  })

  describe("withSystem", () => {
    test("sets system principal scope", () => {
      const result = principal.withSystem({ organizationId: "org-789" }, () => {
        const item = principal.require()
        if (item.kind !== "system") throw new Error("Expected system principal")
        return { kind: item.kind, organizationId: item.organizationId, actingUserId: item.actingUserId }
      })

      expect(result.kind).toBe("system")
      expect(result.organizationId).toBe("org-789")
    })

    test("supports optional actingUserId", () => {
      const result = principal.withSystem({ organizationId: "org-1", actingUserId: "user-acting" }, () => {
        const item = principal.require()
        return item
      })

      expect(result.kind).toBe("system")
      if (result.kind === "system") {
        expect(result.actingUserId).toBe("user-acting")
      }
    })

    test("returns the function result", () => {
      const result = principal.withSystem({ organizationId: "o1" }, () => 42)
      expect(result).toBe(42)
    })
  })

  describe("withPublic", () => {
    test("sets public principal scope", () => {
      const result = principal.withPublic(() => {
        const item = principal.require()
        return item.kind
      })

      expect(result).toBe("public")
    })

    test("public principal has no identity fields", () => {
      const result = principal.withPublic(() => {
        const item = principal.require()
        return { hasOrg: "organizationId" in item, hasUser: "userId" in item }
      })

      expect(result.hasOrg).toBe(false)
      expect(result.hasUser).toBe(false)
    })
  })

  describe("requireKind", () => {
    test("returns principal when kind matches", () => {
      const result = principal.withUser({ userId: "u1", organizationId: "o1", email: "e@e.com" }, () =>
        principal.requireKind("user"),
      )
      expect(result.kind).toBe("user")
    })

    test("throws PrincipalKindMismatchError when kind does not match", () => {
      assertAppError(
        () =>
          principal.withUser({ userId: "u1", organizationId: "o1", email: "e@e.com" }, () =>
            principal.requireKind("system"),
          ),
        "PrincipalKindMismatchError",
      )
    })

    test("error contains expected and actual kinds", () => {
      try {
        principal.withUser({ userId: "u1", organizationId: "o1", email: "e@e.com" }, () =>
          principal.requireKind("system"),
        )
        expect.fail("should have thrown")
      } catch (e) {
        expect(isAppError(e)).toBe(true)
        if (isAppError(e) && e.name === "PrincipalKindMismatchError") {
          const data = e.data as { expected: string; actual: string }
          expect(data.expected).toBe("system")
          expect(data.actual).toBe("user")
        }
      }
    })
  })

  describe("orgId", () => {
    test("returns organizationId for user principal", () => {
      const result = principal.withUser({ userId: "u1", organizationId: "org-user", email: "e@e.com" }, () =>
        principal.orgId(),
      )
      expect(result).toBe("org-user")
    })

    test("returns organizationId for system principal", () => {
      const result = principal.withSystem({ organizationId: "org-system" }, () => principal.orgId())
      expect(result).toBe("org-system")
    })

    test("throws PrincipalPropertyError for public principal", () => {
      assertAppError(() => principal.withPublic(() => principal.orgId()), "PrincipalPropertyError")
    })

    test("error contains property name and principal kind", () => {
      try {
        principal.withPublic(() => principal.orgId())
        expect.fail("should have thrown")
      } catch (e) {
        expect(isAppError(e)).toBe(true)
        if (isAppError(e) && e.name === "PrincipalPropertyError") {
          const data = e.data as { property: string; principalKind: string }
          expect(data.property).toBe("organizationId")
          expect(data.principalKind).toBe("public")
        }
      }
    })
  })

  describe("userId", () => {
    test("returns userId for user principal", () => {
      const result = principal.withUser({ userId: "user-specific", organizationId: "o1", email: "e@e.com" }, () =>
        principal.userId(),
      )
      expect(result).toBe("user-specific")
    })

    test("throws PrincipalPropertyError for system principal", () => {
      assertAppError(
        () => principal.withSystem({ organizationId: "o1" }, () => principal.userId()),
        "PrincipalPropertyError",
      )
    })

    test("throws PrincipalPropertyError for public principal", () => {
      assertAppError(() => principal.withPublic(() => principal.userId()), "PrincipalPropertyError")
    })

    test("error contains property name for system principal", () => {
      try {
        principal.withSystem({ organizationId: "o1" }, () => principal.userId())
        expect.fail("should have thrown")
      } catch (e) {
        expect(isAppError(e)).toBe(true)
        if (isAppError(e) && e.name === "PrincipalPropertyError") {
          const data = e.data as { property: string; principalKind: string }
          expect(data.property).toBe("userId")
          expect(data.principalKind).toBe("system")
        }
      }
    })
  })

  describe("actingUserId", () => {
    test("returns userId for user principal", () => {
      const result = principal.withUser({ userId: "user-acting", organizationId: "o1", email: "e@e.com" }, () =>
        principal.actingUserId(),
      )
      expect(result).toBe("user-acting")
    })

    test("returns actingUserId for system principal when set", () => {
      const result = principal.withSystem({ organizationId: "o1", actingUserId: "acting-user-id" }, () =>
        principal.actingUserId(),
      )
      expect(result).toBe("acting-user-id")
    })

    test("throws PrincipalPropertyError for system principal without actingUserId", () => {
      assertAppError(
        () => principal.withSystem({ organizationId: "o1" }, () => principal.actingUserId()),
        "PrincipalPropertyError",
      )
    })

    test("throws PrincipalPropertyError for public principal", () => {
      assertAppError(() => principal.withPublic(() => principal.actingUserId()), "PrincipalPropertyError")
    })
  })

  describe("nested scopes", () => {
    test("inner scope overrides outer scope", () => {
      const result = principal.withUser({ userId: "outer", organizationId: "o1", email: "e@e.com" }, () => {
        const outerUserId = principal.userId()
        const innerResult = principal.withUser({ userId: "inner", organizationId: "o2", email: "e2@e.com" }, () => {
          return principal.userId()
        })
        const afterInnerUserId = principal.userId()
        return { outerUserId, innerResult, afterInnerUserId }
      })

      expect(result.outerUserId).toBe("outer")
      expect(result.innerResult).toBe("inner")
      expect(result.afterInnerUserId).toBe("outer")
    })

    test("can switch from user to system scope", () => {
      const result = principal.withUser({ userId: "u1", organizationId: "org-user", email: "e@e.com" }, () => {
        const userOrgId = principal.orgId()
        const systemResult = principal.withSystem({ organizationId: "org-system" }, () => {
          return { kind: principal.require().kind, orgId: principal.orgId() }
        })
        return { userOrgId, systemResult }
      })

      expect(result.userOrgId).toBe("org-user")
      expect(result.systemResult.kind).toBe("system")
      expect(result.systemResult.orgId).toBe("org-system")
    })

    test("scope is isolated between async operations", async () => {
      const results = await Promise.all([
        principal.withUser({ userId: "user-a", organizationId: "org-a", email: "a@e.com" }, async () => {
          await new Promise((r) => setTimeout(r, 10))
          return principal.userId()
        }),
        principal.withUser({ userId: "user-b", organizationId: "org-b", email: "b@e.com" }, async () => {
          await new Promise((r) => setTimeout(r, 5))
          return principal.userId()
        }),
      ])

      expect(results[0]).toBe("user-a")
      expect(results[1]).toBe("user-b")
    })
  })

  describe("error status codes", () => {
    test("MissingPrincipalError has 401 status", () => {
      const error = createError("MissingPrincipalError", { message: "test" })
      expect(error.status).toBe(401)
    })

    test("PrincipalKindMismatchError has 403 status", () => {
      const error = createError("PrincipalKindMismatchError", { expected: "user", actual: "system" })
      expect(error.status).toBe(403)
    })

    test("PrincipalPropertyError has 400 status", () => {
      const error = createError("PrincipalPropertyError", { property: "userId", principalKind: "public" })
      expect(error.status).toBe(400)
    })
  })
})
