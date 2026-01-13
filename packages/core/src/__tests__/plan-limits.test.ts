import { describe, test, expect } from "vitest"
import { PLAN_LIMITS, type SubscriptionPlan } from "../types/subscription"

describe("PLAN_LIMITS - Resource Limits", () => {
  describe("userLimit", () => {
    test("free plan has 1 user limit", () => {
      expect(PLAN_LIMITS.free.userLimit).toBe(1)
    })

    test("starter plan has 5 user limit", () => {
      expect(PLAN_LIMITS.starter.userLimit).toBe(5)
    })

    test("pro plan has 15 user limit", () => {
      expect(PLAN_LIMITS.pro.userLimit).toBe(15)
    })

    test("business plan has unlimited users", () => {
      expect(PLAN_LIMITS.business.userLimit).toBeNull()
    })
  })

  describe("agentLimit", () => {
    test("free plan has 2 agent limit", () => {
      expect(PLAN_LIMITS.free.agentLimit).toBe(2)
    })

    test("starter plan has 10 agent limit", () => {
      expect(PLAN_LIMITS.starter.agentLimit).toBe(10)
    })

    test("pro plan has 30 agent limit", () => {
      expect(PLAN_LIMITS.pro.agentLimit).toBe(30)
    })

    test("business plan has unlimited agents", () => {
      expect(PLAN_LIMITS.business.agentLimit).toBeNull()
    })
  })
})

describe("PLAN_LIMITS - Structure Validation", () => {
  test("all plans have required fields", () => {
    const plans: SubscriptionPlan[] = ["free", "starter", "pro", "business"]

    plans.forEach((plan) => {
      const limits = PLAN_LIMITS[plan]
      expect(limits).toHaveProperty("runLimit")
      expect(limits).toHaveProperty("overageRate")
      expect(limits).toHaveProperty("userLimit")
      expect(limits).toHaveProperty("agentLimit")
    })
  })

  test("numeric limits are either positive numbers or null", () => {
    const plans: SubscriptionPlan[] = ["free", "starter", "pro", "business"]

    plans.forEach((plan) => {
      const limits = PLAN_LIMITS[plan]

      if (limits.userLimit !== null) {
        expect(limits.userLimit).toBeGreaterThan(0)
      }

      if (limits.agentLimit !== null) {
        expect(limits.agentLimit).toBeGreaterThan(0)
      }
    })
  })
})
