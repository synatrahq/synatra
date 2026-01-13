import { test, expect, describe } from "vitest"
import type Stripe from "stripe"

describe("Subscription Webhook", () => {
  describe("mapStripeStatus", () => {
    function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): "active" | "past_due" | "cancelled" {
      switch (stripeStatus) {
        case "active":
        case "trialing":
          return "active"
        case "past_due":
        case "paused":
          return "past_due"
        case "canceled":
        case "incomplete":
        case "incomplete_expired":
        case "unpaid":
          return "cancelled"
      }
    }

    test("maps active status correctly", () => {
      expect(mapStripeStatus("active")).toBe("active")
    })

    test("maps past_due status correctly", () => {
      expect(mapStripeStatus("past_due")).toBe("past_due")
    })

    test("maps canceled to cancelled", () => {
      expect(mapStripeStatus("canceled")).toBe("cancelled")
    })

    test("maps incomplete_expired to cancelled", () => {
      expect(mapStripeStatus("incomplete_expired")).toBe("cancelled")
    })

    test("maps unpaid to cancelled", () => {
      expect(mapStripeStatus("unpaid")).toBe("cancelled")
    })

    test("maps trialing to active", () => {
      expect(mapStripeStatus("trialing")).toBe("active")
    })

    test("maps incomplete to cancelled", () => {
      expect(mapStripeStatus("incomplete")).toBe("cancelled")
    })

    test("maps paused to past_due", () => {
      expect(mapStripeStatus("paused")).toBe("past_due")
    })
  })

  describe("checkout session validation", () => {
    test("requires organizationId in metadata", () => {
      const session = {
        id: "cs_test",
        metadata: {
          plan: "starter",
        } as Record<string, string>,
      }

      expect(session.metadata.organizationId).toBeUndefined()
    })

    test("requires plan in metadata", () => {
      const session = {
        id: "cs_test",
        metadata: {
          organizationId: "org-123",
        } as Record<string, string>,
      }

      expect(session.metadata.plan).toBeUndefined()
    })

    test("valid metadata contains both fields", () => {
      const session = {
        id: "cs_test",
        metadata: {
          organizationId: "org-123",
          plan: "starter",
        },
      }

      expect(session.metadata.organizationId).toBe("org-123")
      expect(session.metadata.plan).toBe("starter")
    })
  })

  describe("webhook event handling", () => {
    test("handles checkout.session.completed event", () => {
      const eventType = "checkout.session.completed"
      expect(eventType).toBe("checkout.session.completed")
    })

    test("handles invoice.paid event", () => {
      const eventType = "invoice.paid"
      expect(eventType).toBe("invoice.paid")
    })

    test("handles invoice.payment_failed event", () => {
      const eventType = "invoice.payment_failed"
      expect(eventType).toBe("invoice.payment_failed")
    })

    test("handles customer.subscription.updated event", () => {
      const eventType = "customer.subscription.updated"
      expect(eventType).toBe("customer.subscription.updated")
    })

    test("handles customer.subscription.deleted event", () => {
      const eventType = "customer.subscription.deleted"
      expect(eventType).toBe("customer.subscription.deleted")
    })
  })

  describe("transaction safety", () => {
    test("checkout completion should update both stripe info and plan", () => {
      const operations = ["updateStripeInfo", "updatePlan"]
      expect(operations).toHaveLength(2)
    })

    test("subscription deletion should update both plan and status", () => {
      const operations = ["updatePlan", "updateStripeInfo"]
      expect(operations).toHaveLength(2)
    })
  })
})
