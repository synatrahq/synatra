import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { changeSubscriptionPlan, ChangeSubscriptionPlanSchema } from "@synatra/core"

export const changePlan = new Hono().post(
  "/change-plan",
  zValidator("json", ChangeSubscriptionPlanSchema),
  async (c) => {
    const body = c.req.valid("json")
    const result = await changeSubscriptionPlan(body)
    return c.json(result)
  },
)
