import { Hono } from "hono"
import { checkoutPrompt } from "@synatra/core"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const checkout = new Hono().post(
  "/:id/releases/:releaseId/checkout",
  requirePermission("prompt", "update"),
  zValidator("json", z.object({})),
  async (c) => {
    const params = c.req.param()
    const result = await checkoutPrompt({ promptId: params.id, releaseId: params.releaseId })
    if (!result) throw createError("NotFoundError", { type: "PromptRelease", id: params.releaseId })
    return c.json(result, 201)
  },
)
