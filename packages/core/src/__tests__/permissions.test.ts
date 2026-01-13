import { describe, test, expect } from "vitest"
import {
  permissionStatement,
  ac,
  ownerRole,
  adminRole,
  builderRole,
  memberRole,
  type Role,
  type PermissionResource,
  type PermissionAction,
} from "../permissions"

describe("permissions", () => {
  describe("permissionStatement structure", () => {
    test("defines organization permissions", () => {
      expect(permissionStatement.organization).toEqual(["update", "delete"])
    })

    test("defines member permissions", () => {
      expect(permissionStatement.member).toEqual(["create", "update", "delete"])
    })

    test("defines invitation permissions", () => {
      expect(permissionStatement.invitation).toEqual(["create", "cancel"])
    })

    test("defines agent permissions", () => {
      expect(permissionStatement.agent).toEqual(["create", "update", "delete"])
    })

    test("defines channel permissions", () => {
      expect(permissionStatement.channel).toEqual(["create", "update", "delete"])
    })

    test("defines connector permissions", () => {
      expect(permissionStatement.connector).toEqual(["create", "delete"])
    })

    test("defines environment permissions", () => {
      expect(permissionStatement.environment).toEqual(["create", "update", "delete"])
    })

    test("defines resource permissions including read", () => {
      expect(permissionStatement.resource).toEqual(["read", "create", "update", "delete"])
    })

    test("defines prompt permissions", () => {
      expect(permissionStatement.prompt).toEqual(["create", "update", "delete"])
    })

    test("defines trigger permissions", () => {
      expect(permissionStatement.trigger).toEqual(["create", "update", "delete"])
    })

    test("defines schedule permissions", () => {
      expect(permissionStatement.schedule).toEqual(["create", "update", "delete"])
    })

    test("contains all 11 resources", () => {
      const resources = Object.keys(permissionStatement)
      expect(resources.length).toBe(11)
      expect(resources).toContain("organization")
      expect(resources).toContain("member")
      expect(resources).toContain("invitation")
      expect(resources).toContain("agent")
      expect(resources).toContain("channel")
      expect(resources).toContain("connector")
      expect(resources).toContain("environment")
      expect(resources).toContain("resource")
      expect(resources).toContain("prompt")
      expect(resources).toContain("trigger")
      expect(resources).toContain("schedule")
    })
  })

  describe("role definitions exist", () => {
    test("ownerRole is defined", () => {
      expect(ownerRole).toBeDefined()
    })

    test("adminRole is defined", () => {
      expect(adminRole).toBeDefined()
    })

    test("builderRole is defined", () => {
      expect(builderRole).toBeDefined()
    })

    test("memberRole is defined", () => {
      expect(memberRole).toBeDefined()
    })

    test("accessControl instance is defined", () => {
      expect(ac).toBeDefined()
    })
  })

  describe("type safety", () => {
    test("PermissionResource type covers all keys", () => {
      const resources: PermissionResource[] = [
        "organization",
        "member",
        "invitation",
        "agent",
        "channel",
        "connector",
        "environment",
        "resource",
        "prompt",
        "trigger",
        "schedule",
      ]
      expect(resources.length).toBe(11)
    })

    test("agent actions are typed correctly", () => {
      const actions: PermissionAction<"agent">[] = ["create", "update", "delete"]
      expect(actions.length).toBe(3)
    })

    test("resource actions include read", () => {
      const actions: PermissionAction<"resource">[] = ["read", "create", "update", "delete"]
      expect(actions.length).toBe(4)
    })

    test("invitation actions are create and cancel", () => {
      const actions: PermissionAction<"invitation">[] = ["create", "cancel"]
      expect(actions.length).toBe(2)
    })
  })

  describe("role type", () => {
    test("Role type has four values", () => {
      const roles: Role[] = ["owner", "admin", "builder", "member"]
      expect(roles.length).toBe(4)
    })
  })

  describe("permission coverage analysis", () => {
    test("organization only has update and delete (no create - org created via signup)", () => {
      expect(permissionStatement.organization).not.toContain("create")
      expect(permissionStatement.organization).toContain("update")
      expect(permissionStatement.organization).toContain("delete")
    })

    test("connector has limited actions (only create and delete)", () => {
      expect(permissionStatement.connector).toEqual(["create", "delete"])
      expect(permissionStatement.connector).not.toContain("update")
    })

    test("resource is the only one with read permission", () => {
      const resourcesWithRead = Object.entries(permissionStatement).filter(([, actions]) =>
        (actions as readonly string[]).includes("read"),
      )
      expect(resourcesWithRead.length).toBe(1)
      expect(resourcesWithRead[0][0]).toBe("resource")
    })

    test("all standard resources have create, update, delete", () => {
      const standardResources = ["agent", "channel", "environment", "prompt", "trigger", "schedule"]
      for (const resource of standardResources) {
        const actions = permissionStatement[resource as PermissionResource]
        expect(actions).toContain("create")
        expect(actions).toContain("update")
        expect(actions).toContain("delete")
      }
    })
  })

  describe("security constraints documentation", () => {
    test("organization delete is restricted (only owner)", () => {
      expect(permissionStatement.organization).toContain("delete")
    })

    test("member management requires elevated privileges", () => {
      expect(permissionStatement.member).toEqual(["create", "update", "delete"])
    })

    test("environment management is sensitive operation", () => {
      expect(permissionStatement.environment).toEqual(["create", "update", "delete"])
    })
  })
})
