import { describe, test, expect } from "vitest"
import { PLAN_LIMITS } from "../types/subscription"

function exceedsLimit(current: number, additional: number, limit: number): boolean {
  return current + additional > limit
}

function exceedsUserLimit(members: number, pending: number, additional: number, limit: number): boolean {
  return members + pending + additional > limit
}

describe("Plan Limit Check Logic", () => {
  describe("Agent Limits", () => {
    const limit = PLAN_LIMITS.free.agentLimit!

    test("allows creation within limit", () => {
      expect(exceedsLimit(0, 1, limit)).toBe(false)
      expect(exceedsLimit(1, 1, limit)).toBe(false)
    })

    test("blocks creation exceeding limit", () => {
      expect(exceedsLimit(2, 1, limit)).toBe(true)
      expect(exceedsLimit(1, 2, limit)).toBe(true)
    })

    test("boundary at exact limit is allowed", () => {
      expect(exceedsLimit(0, 2, limit)).toBe(false)
    })
  })

  describe("User Limits", () => {
    const freeLimit = PLAN_LIMITS.free.userLimit!
    const starterLimit = PLAN_LIMITS.starter.userLimit!

    test("allows invitation within limit", () => {
      expect(exceedsUserLimit(0, 0, 1, freeLimit)).toBe(false)
      expect(exceedsUserLimit(1, 0, 2, starterLimit)).toBe(false)
    })

    test("blocks invitation exceeding limit", () => {
      expect(exceedsUserLimit(1, 0, 1, freeLimit)).toBe(true)
      expect(exceedsUserLimit(0, 1, 1, freeLimit)).toBe(true)
    })

    test("allows bulk invitation within limit", () => {
      expect(exceedsUserLimit(1, 0, 2, starterLimit)).toBe(false)
      expect(exceedsUserLimit(3, 0, 2, starterLimit)).toBe(false)
    })

    test("blocks bulk invitation exceeding limit", () => {
      expect(exceedsUserLimit(1, 0, 5, starterLimit)).toBe(true)
      expect(exceedsUserLimit(4, 0, 2, starterLimit)).toBe(true)
    })

    test("boundary at exact limit is allowed", () => {
      expect(exceedsUserLimit(0, 0, 1, freeLimit)).toBe(false)
      expect(exceedsUserLimit(1, 0, 4, starterLimit)).toBe(false)
    })

    test("counts both members and pending invitations", () => {
      expect(exceedsUserLimit(0, 0, 1, freeLimit)).toBe(false)
      expect(exceedsUserLimit(0, 1, 1, freeLimit)).toBe(true)
    })
  })

  describe("Plan-specific Agent Boundaries", () => {
    test("starter plan boundary", () => {
      const limit = PLAN_LIMITS.starter.agentLimit!
      expect(exceedsLimit(9, 1, limit)).toBe(false)
      expect(exceedsLimit(10, 1, limit)).toBe(true)
    })

    test("pro plan boundary", () => {
      const limit = PLAN_LIMITS.pro.agentLimit!
      expect(exceedsLimit(29, 1, limit)).toBe(false)
      expect(exceedsLimit(30, 1, limit)).toBe(true)
    })
  })

  describe("Unlimited Plans", () => {
    test("business plan has null limits", () => {
      expect(PLAN_LIMITS.business.agentLimit).toBeNull()
      expect(PLAN_LIMITS.business.userLimit).toBeNull()
    })
  })
})
