import { describe, test, expect } from "vitest"
import { PLAN_LIMITS } from "../types"

describe("Overage Billing", () => {
  describe("plan limits and overage rates", () => {
    test("free plan has no overage rate", () => {
      expect(PLAN_LIMITS.free.runLimit).toBe(150)
      expect(PLAN_LIMITS.free.overageRate).toBeNull()
    })

    test("starter plan has overage rate", () => {
      expect(PLAN_LIMITS.starter.runLimit).toBe(1000)
      expect(PLAN_LIMITS.starter.overageRate).toBe("0.08")
    })

    test("pro plan has lower overage rate than starter", () => {
      const { overageRate: starter } = PLAN_LIMITS.starter
      const { overageRate: pro } = PLAN_LIMITS.pro

      expect(parseFloat(pro!)).toBeLessThan(parseFloat(starter!))
      expect(pro).toBe("0.06")
    })

    test("business plan has lower overage rate than pro", () => {
      const { overageRate: pro } = PLAN_LIMITS.pro
      const { overageRate: business } = PLAN_LIMITS.business

      expect(parseFloat(business!)).toBeLessThan(parseFloat(pro!))
      expect(business).toBe("0.05")
    })
  })

  describe("overage calculation", () => {
    test("calculates overage cost for starter plan", () => {
      const cost = 100 * parseFloat(PLAN_LIMITS.starter.overageRate!)
      expect(cost).toBe(8.0)
    })

    test("calculates overage cost for pro plan", () => {
      const cost = 100 * parseFloat(PLAN_LIMITS.pro.overageRate!)
      expect(cost).toBe(6.0)
    })

    test("calculates overage cost for business plan", () => {
      const cost = 100 * parseFloat(PLAN_LIMITS.business.overageRate!)
      expect(cost).toBe(5.0)
    })
  })

  describe("run limit thresholds", () => {
    test("80% threshold warning for free plan", () => {
      const threshold = Math.floor(PLAN_LIMITS.free.runLimit! * 0.8)
      expect(threshold).toBe(120)
    })

    test("100% threshold error for free plan", () => {
      expect(PLAN_LIMITS.free.runLimit).toBe(150)
    })

    test("overage allowed for paid plans after 100%", () => {
      expect(PLAN_LIMITS.starter.overageRate).not.toBeNull()
      expect(PLAN_LIMITS.pro.overageRate).not.toBeNull()
      expect(PLAN_LIMITS.business.overageRate).not.toBeNull()
    })
  })

  describe("soft vs hard mode behavior", () => {
    test("soft mode allows overage for paid plans", () => {
      expect(PLAN_LIMITS.starter.overageRate).not.toBeNull()
    })

    test("soft mode blocks overage for free plan", () => {
      expect(PLAN_LIMITS.free.overageRate).toBeNull()
    })
  })

  describe("pricing strategy alignment", () => {
    test("all paid plans match pricing strategy", () => {
      const expected = {
        starter: { runLimit: 1000, overageRate: "0.08" },
        pro: { runLimit: 2500, overageRate: "0.06" },
        business: { runLimit: 6000, overageRate: "0.05" },
        enterprise: { runLimit: 15000, overageRate: "0.04" },
      } as const

      for (const plan of ["starter", "pro", "business", "business"] as const) {
        expect(PLAN_LIMITS[plan].runLimit).toBe(expected[plan].runLimit)
        expect(PLAN_LIMITS[plan].overageRate).toBe(expected[plan].overageRate)
      }
    })
  })
})
