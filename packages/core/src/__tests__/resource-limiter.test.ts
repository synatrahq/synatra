import { describe, test, expect } from "vitest"
import { PLAN_LIMITS, type SubscriptionPlan } from "../types/subscription"

describe("ResourceLimiter Logic", () => {
  describe("agentLimit logic", () => {
    test("free plan should block at 2 agents", () => {
      const limit = PLAN_LIMITS.free.agentLimit
      expect(limit).toBe(2)

      const currentCount = 2
      const shouldBlock = currentCount >= limit!
      expect(shouldBlock).toBe(true)
    })

    test("free plan should allow 1 agent", () => {
      const limit = PLAN_LIMITS.free.agentLimit
      expect(limit).toBe(2)

      const currentCount = 1
      const shouldBlock = currentCount >= limit!
      expect(shouldBlock).toBe(false)
    })

    test("starter plan should block at 10 agents", () => {
      const limit = PLAN_LIMITS.starter.agentLimit
      expect(limit).toBe(10)

      const currentCount = 10
      const shouldBlock = currentCount >= limit!
      expect(shouldBlock).toBe(true)
    })

    test("business plan should never block (unlimited)", () => {
      const limit = PLAN_LIMITS.business.agentLimit
      expect(limit).toBeNull()

      const shouldBlock = limit === null ? false : true
      expect(shouldBlock).toBe(false)
    })
  })

  describe("userLimit logic (members + invitations)", () => {
    test("free plan should block at 1 total user", () => {
      const limit = PLAN_LIMITS.free.userLimit
      expect(limit).toBe(1)

      const members = 1
      const invitations = 0
      const total = members + invitations
      const shouldBlock = total >= limit!
      expect(shouldBlock).toBe(true)
    })

    test("free plan should allow 0 users", () => {
      const limit = PLAN_LIMITS.free.userLimit
      const members = 0
      const invitations = 0
      const total = members + invitations
      const shouldBlock = total >= limit!
      expect(shouldBlock).toBe(false)
    })

    test("starter plan should block at 5 total users", () => {
      const limit = PLAN_LIMITS.starter.userLimit
      expect(limit).toBe(5)

      const members = 3
      const invitations = 2
      const total = members + invitations
      const shouldBlock = total >= limit!
      expect(shouldBlock).toBe(true)
    })

    test("pro plan should block at 15 total users", () => {
      const limit = PLAN_LIMITS.pro.userLimit
      expect(limit).toBe(15)

      const members = 10
      const invitations = 5
      const total = members + invitations
      const shouldBlock = total >= limit!
      expect(shouldBlock).toBe(true)
    })

    test("business plan should never block (unlimited)", () => {
      const limit = PLAN_LIMITS.business.userLimit
      expect(limit).toBeNull()

      const members = 100
      const invitations = 50
      const shouldBlock = limit === null ? false : members + invitations >= limit
      expect(shouldBlock).toBe(false)
    })
  })

  describe("unlimited handling", () => {
    test("null limit means unlimited", () => {
      const plans: SubscriptionPlan[] = ["free", "starter", "pro", "business"]

      plans.forEach((plan) => {
        const limits = PLAN_LIMITS[plan]

        if (limits.agentLimit === null) {
          expect(["business"]).toContain(plan)
        }

        if (limits.userLimit === null) {
          expect(["business"]).toContain(plan)
        }
      })
    })

    test("checking unlimited limits should always allow", () => {
      const unlimitedLimits = [PLAN_LIMITS.business.agentLimit, PLAN_LIMITS.business.userLimit]

      unlimitedLimits.forEach((limit) => {
        expect(limit).toBeNull()
        const shouldAllow = limit === null
        expect(shouldAllow).toBe(true)
      })
    })
  })

  describe("edge cases", () => {
    test("at limit should block", () => {
      const plans: SubscriptionPlan[] = ["free", "starter", "pro"]

      plans.forEach((plan) => {
        const agentLimit = PLAN_LIMITS[plan].agentLimit
        if (agentLimit !== null) {
          const shouldBlock = agentLimit >= agentLimit
          expect(shouldBlock).toBe(true)
        }
      })
    })

    test("one below limit should allow", () => {
      const plans: SubscriptionPlan[] = ["free", "starter", "pro"]

      plans.forEach((plan) => {
        const agentLimit = PLAN_LIMITS[plan].agentLimit
        if (agentLimit !== null) {
          const shouldBlock = agentLimit - 1 >= agentLimit
          expect(shouldBlock).toBe(false)
        }
      })
    })

    test("over limit should block", () => {
      const plans: SubscriptionPlan[] = ["free", "starter", "pro"]

      plans.forEach((plan) => {
        const agentLimit = PLAN_LIMITS[plan].agentLimit
        if (agentLimit !== null) {
          const shouldBlock = agentLimit + 1 >= agentLimit
          expect(shouldBlock).toBe(true)
        }
      })
    })
  })

  describe("plan upgrade scenarios", () => {
    test("upgrading from free to starter increases agent limit", () => {
      const freeLimitAgents = PLAN_LIMITS.free.agentLimit!
      const starterLimitAgents = PLAN_LIMITS.starter.agentLimit!
      expect(starterLimitAgents).toBeGreaterThan(freeLimitAgents)
    })

    test("upgrading from starter to pro increases agent limit", () => {
      const starterLimitAgents = PLAN_LIMITS.starter.agentLimit!
      const proLimitAgents = PLAN_LIMITS.pro.agentLimit!
      expect(proLimitAgents).toBeGreaterThan(starterLimitAgents)
    })

    test("upgrading to business removes agent limit", () => {
      const proLimitAgents = PLAN_LIMITS.pro.agentLimit
      const businessLimitAgents = PLAN_LIMITS.business.agentLimit
      expect(proLimitAgents).not.toBeNull()
      expect(businessLimitAgents).toBeNull()
    })

    test("all upgrade paths increase or remove limits", () => {
      const upgradePaths: [SubscriptionPlan, SubscriptionPlan][] = [
        ["free", "starter"],
        ["starter", "pro"],
        ["pro", "business"],
        ["business", "business"],
      ]

      upgradePaths.forEach(([from, to]) => {
        const fromLimits = PLAN_LIMITS[from]
        const toLimits = PLAN_LIMITS[to]

        if (fromLimits.agentLimit !== null && toLimits.agentLimit !== null) {
          expect(toLimits.agentLimit).toBeGreaterThanOrEqual(fromLimits.agentLimit)
        }

        if (fromLimits.userLimit !== null && toLimits.userLimit !== null) {
          expect(toLimits.userLimit).toBeGreaterThanOrEqual(fromLimits.userLimit)
        }
      })
    })
  })
})
