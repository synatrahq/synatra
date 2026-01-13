import { Hono } from "hono"
import { checkoutAgent } from "@synatra/core"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { requirePermission } from "../../../middleware/principal"

export const checkout = new Hono().post(
  "/:id/releases/:releaseId/checkout",
  requirePermission("agent", "update"),
  zValidator("json", z.object({})),
  async (c) => {
    const params = c.req.param()
    const result = await checkoutAgent({ agentId: params.id, releaseId: params.releaseId })
    return c.json(result, 201)
  },
)
