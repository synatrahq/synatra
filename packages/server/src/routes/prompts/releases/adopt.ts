import { Hono } from "hono"
import { adoptPrompt } from "@synatra/core"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const adopt = new Hono().post(
  "/:id/releases/:releaseId/adopt",
  requirePermission("prompt", "update"),
  zValidator("json", z.object({})),
  async (c) => {
    const params = c.req.param()
    const release = await adoptPrompt({ promptId: params.id, releaseId: params.releaseId })
    if (!release) throw createError("NotFoundError", { type: "PromptRelease", id: params.releaseId })
    return c.json(release)
  },
)
