import { Hono } from "hono"
import { checkoutTrigger } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const checkout = new Hono().post(
  "/:id/releases/:releaseId/checkout",
  requirePermission("trigger", "update"),
  async (c) => {
    const triggerId = c.req.param("id")
    const releaseId = c.req.param("releaseId")

    const result = await checkoutTrigger({ triggerId, releaseId })
    if (!result) throw createError("NotFoundError", { type: "TriggerRelease", id: releaseId })
    return c.json(result)
  },
)
