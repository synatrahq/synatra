import { describe, test, expect } from "vitest"
import { z } from "zod"
import {
  canResumeSubscription,
  getStripePriceIdSubscription,
  isUpgradeSubscription,
  isDowngradeSubscription,
} from "../subscription"
import { SubscriptionPlan, SubscriptionStatus, PLAN_HIERARCHY, PLAN_LIMITS } from "../types"

describe("Subscription", () => {
  describe("getStripePriceId", () => {
    test("returns null for free plan", () => {
      expect(getStripePriceIdSubscription("free")).toBeNull()
    })

    test("returns null for enterprise plan", () => {
      expect(getStripePriceIdSubscription("business")).toBeNull()
    })

    test("returns price id for starter plan", () => {
      const priceId = getStripePriceIdSubscription("starter")
      expect(priceId).toBeDefined()
    })
  })

  describe("PLAN_LIMITS", () => {
    test("returns correct limits for free plan", () => {
      expect(PLAN_LIMITS.free.runLimit).toBe(150)
      expect(PLAN_LIMITS.free.overageRate).toBeNull()
      expect(PLAN_LIMITS.free.userLimit).toBe(1)
      expect(PLAN_LIMITS.free.agentLimit).toBe(2)
    })

    test("returns correct limits for starter plan", () => {
      expect(PLAN_LIMITS.starter.runLimit).toBe(1000)
      expect(PLAN_LIMITS.starter.overageRate).toBe("0.08")
      expect(PLAN_LIMITS.starter.userLimit).toBe(5)
      expect(PLAN_LIMITS.starter.agentLimit).toBe(10)
    })

    test("returns correct limits for pro plan", () => {
      expect(PLAN_LIMITS.pro.runLimit).toBe(2500)
      expect(PLAN_LIMITS.pro.overageRate).toBe("0.06")
      expect(PLAN_LIMITS.pro.userLimit).toBe(15)
      expect(PLAN_LIMITS.pro.agentLimit).toBe(30)
    })

    test("returns correct limits for business plan", () => {
      expect(PLAN_LIMITS.business.runLimit).toBe(6000)
      expect(PLAN_LIMITS.business.overageRate).toBe("0.05")
      expect(PLAN_LIMITS.business.userLimit).toBeNull()
      expect(PLAN_LIMITS.business.agentLimit).toBeNull()
    })
  })

  describe("updateStripeInfo validation", () => {
    test("accepts valid subscription status", () => {
      const schema = z.enum(SubscriptionStatus)

      expect(() => schema.parse("active")).not.toThrow()
      expect(() => schema.parse("cancelled")).not.toThrow()
      expect(() => schema.parse("past_due")).not.toThrow()
    })

    test("rejects invalid subscription status", () => {
      const schema = z.enum(SubscriptionStatus)

      expect(() => schema.parse("invalid")).toThrow()
      expect(() => schema.parse("trialing")).toThrow()
      expect(() => schema.parse("paused")).toThrow()
      expect(() => schema.parse("")).toThrow()
    })
  })

  describe("updatePlan validation", () => {
    test("accepts valid subscription plan", () => {
      const schema = z.enum(SubscriptionPlan)

      expect(() => schema.parse("free")).not.toThrow()
      expect(() => schema.parse("starter")).not.toThrow()
      expect(() => schema.parse("pro")).not.toThrow()
      expect(() => schema.parse("business")).not.toThrow()
      expect(() => schema.parse("business")).not.toThrow()
    })

    test("rejects invalid subscription plan", () => {
      const schema = z.enum(SubscriptionPlan)

      expect(() => schema.parse("invalid")).toThrow()
      expect(() => schema.parse("premium")).toThrow()
      expect(() => schema.parse("")).toThrow()
    })
  })

  describe("updateSubscription validation", () => {
    test("requires plan parameter", () => {
      const schema = z.object({
        plan: z.enum(SubscriptionPlan),
        stripeCustomerId: z.string().optional(),
        status: z.enum(SubscriptionStatus).optional(),
      })

      expect(() => schema.parse({ plan: "starter" })).not.toThrow()
      expect(() => schema.parse({})).toThrow()
    })

    test("validates plan and status together", () => {
      const schema = z.object({
        plan: z.enum(SubscriptionPlan),
        status: z.enum(SubscriptionStatus).optional(),
      })

      expect(() => schema.parse({ plan: "starter", status: "active" })).not.toThrow()
      expect(() => schema.parse({ plan: "free", status: "cancelled" })).not.toThrow()
      expect(() => schema.parse({ plan: "invalid", status: "active" })).toThrow()
      expect(() => schema.parse({ plan: "starter", status: "invalid" })).toThrow()
    })
  })

  describe("plan comparison helpers", () => {
    test("PLAN_HIERARCHY returns correct order", () => {
      expect(PLAN_HIERARCHY.free).toBe(0)
      expect(PLAN_HIERARCHY.starter).toBe(1)
      expect(PLAN_HIERARCHY.pro).toBe(2)
      expect(PLAN_HIERARCHY.business).toBe(3)
    })

    test("isUpgrade detects upgrades correctly", () => {
      expect(isUpgradeSubscription("free", "starter")).toBe(true)
      expect(isUpgradeSubscription("starter", "pro")).toBe(true)
      expect(isUpgradeSubscription("pro", "business")).toBe(true)

      expect(isUpgradeSubscription("starter", "free")).toBe(false)
      expect(isUpgradeSubscription("pro", "pro")).toBe(false)
      expect(isUpgradeSubscription("business", "business")).toBe(false)
    })

    test("isDowngrade detects downgrades correctly", () => {
      expect(isDowngradeSubscription("starter", "free")).toBe(true)
      expect(isDowngradeSubscription("pro", "starter")).toBe(true)
      expect(isDowngradeSubscription("business", "pro")).toBe(true)

      expect(isDowngradeSubscription("free", "starter")).toBe(false)
      expect(isDowngradeSubscription("pro", "pro")).toBe(false)
      expect(isDowngradeSubscription("business", "business")).toBe(false)
    })

    test("upgrade and downgrade are mutually exclusive", () => {
      const plans: SubscriptionPlan[] = ["free", "starter", "pro", "business"]

      plans.forEach((current) => {
        plans.forEach((target) => {
          const upgrade = isUpgradeSubscription(current, target)
          const downgrade = isDowngradeSubscription(current, target)

          if (current === target) {
            expect(upgrade).toBe(false)
            expect(downgrade).toBe(false)
          } else {
            expect(upgrade !== downgrade).toBe(true)
          }
        })
      })
    })
  })

  describe("canResumeSubscription", () => {
    test("returns true when resumable", () => {
      const result = canResumeSubscription({
        stripeSubscriptionId: "sub_123",
        cancelAt: new Date(),
        status: "active",
      })

      expect(result).toBe(true)
    })

    test("rejects missing subscription id", () => {
      const result = canResumeSubscription({
        stripeSubscriptionId: null,
        cancelAt: new Date(),
        status: "active",
      })

      expect(result).toBe(false)
    })

    test("rejects cancelled subscription", () => {
      const result = canResumeSubscription({
        stripeSubscriptionId: "sub_123",
        cancelAt: new Date(),
        status: "cancelled",
      })

      expect(result).toBe(false)
    })

    test("rejects when not scheduled to cancel", () => {
      const result = canResumeSubscription({
        stripeSubscriptionId: "sub_123",
        cancelAt: null,
        status: "active",
      })

      expect(result).toBe(false)
    })
  })
})
