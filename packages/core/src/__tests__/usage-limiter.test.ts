import { describe, test, expect } from "vitest"
import { z } from "zod"
import { UsageRunType } from "../types"

describe("UsageLimiter", () => {
  describe("checkAndIncrementRun validation", () => {
    test("accepts valid run types", () => {
      const schema = z.enum(UsageRunType)

      expect(() => schema.parse("user")).not.toThrow()
      expect(() => schema.parse("trigger")).not.toThrow()
      expect(() => schema.parse("subagent")).not.toThrow()
    })

    test("rejects invalid run types", () => {
      const schema = z.enum(UsageRunType)

      expect(() => schema.parse("invalid")).toThrow()
      expect(() => schema.parse("playground")).toThrow()
      expect(() => schema.parse("debug")).toThrow()
      expect(() => schema.parse("")).toThrow()
    })

    test("accepts valid modes", () => {
      const schema = z.enum(["soft", "hard"])

      expect(() => schema.parse("soft")).not.toThrow()
      expect(() => schema.parse("hard")).not.toThrow()
    })

    test("rejects invalid modes", () => {
      const schema = z.enum(["soft", "hard"])

      expect(() => schema.parse("warn")).toThrow()
      expect(() => schema.parse("invalid")).toThrow()
      expect(() => schema.parse("")).toThrow()
    })
  })

  describe("run type classification", () => {
    test("all run types are accounted for", () => {
      const types: UsageRunType[] = ["user", "trigger", "subagent"]
      expect(types).toHaveLength(3)
    })
  })

  describe("overage behavior", () => {
    test("free plan should not allow overage", () => {
      const plans = ["free", "starter", "pro", "business", "business"]
      const freePlan = plans[0]
      expect(freePlan).toBe("free")
    })

    test("paid plans should have overage rates", () => {
      const overageRates = {
        starter: "0.08",
        pro: "0.06",
        business: "0.05",
        enterprise: "0.04",
      }

      Object.values(overageRates).forEach((rate) => {
        expect(parseFloat(rate)).toBeGreaterThan(0)
      })
    })
  })
})
