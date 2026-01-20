import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { verifyCheckoutSession, VerifyCheckoutSessionSchema } from "@synatra/core"

export const verifyCheckout = new Hono().post(
  "/verify-checkout",
  zValidator("json", VerifyCheckoutSessionSchema),
  async (c) => {
    const body = c.req.valid("json")
    const result = await verifyCheckoutSession(body)
    return c.json(result)
  },
)
