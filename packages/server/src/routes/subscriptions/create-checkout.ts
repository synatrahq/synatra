import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { createCheckoutSession, CreateCheckoutSessionSchema } from "@synatra/core"

export const createCheckout = new Hono().post(
  "/create-checkout",
  zValidator("json", CreateCheckoutSessionSchema),
  async (c) => {
    const body = c.req.valid("json")
    const result = await createCheckoutSession(body)
    return c.json(result)
  },
)
