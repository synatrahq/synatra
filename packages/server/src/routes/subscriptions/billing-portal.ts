import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { createBillingPortalSession, CreateBillingPortalSessionSchema } from "@synatra/core"

export const billingPortal = new Hono().post(
  "/billing-portal",
  zValidator("json", CreateBillingPortalSessionSchema),
  async (c) => {
    const body = c.req.valid("json")
    const result = await createBillingPortalSession(body)
    return c.json(result)
  },
)
