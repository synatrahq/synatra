import { Hono } from "hono"
import { getUser } from "@synatra/core"

export const get = new Hono().get("/me", async (c) => {
  const user = await getUser()
  return c.json(user)
})
