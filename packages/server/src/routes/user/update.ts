import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { UpdateUserSchema, updateUser } from "@synatra/core"

export const update = new Hono().patch("/me", zValidator("json", UpdateUserSchema), async (c) => {
  const body = c.req.valid("json")
  const user = await updateUser(body)
  return c.json(user)
})
