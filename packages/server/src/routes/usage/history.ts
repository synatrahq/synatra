import { usageHistory } from "@synatra/core"
import { createError } from "@synatra/util/error"
import { Hono } from "hono"

export const history = new Hono().get("/history", async (c) => {
  const raw = c.req.query("months")
  const months = raw ? Number(raw) : undefined
  if (raw && Number.isNaN(months)) {
    throw createError("BadRequestError", { message: "Invalid months" })
  }
  const result = await usageHistory({ months })
  return c.json(result)
})
