import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { changePlan as changePlanCore, ChangePlanSchema } from "@synatra/core"

export const changePlan = new Hono().post("/change-plan", zValidator("json", ChangePlanSchema), async (c) => {
  const body = c.req.valid("json")
  const result = await changePlanCore(body)
  return c.json(result)
})
