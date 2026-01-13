import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { deployPrompt, DeployPromptSchema } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const deploy = new Hono().post(
  "/:id/deploy",
  requirePermission("prompt", "update"),
  zValidator("json", DeployPromptSchema.omit({ promptId: true })),
  async (c) => {
    const promptId = c.req.param("id")
    const body = c.req.valid("json")
    const release = await deployPrompt({ promptId, ...body })
    if (!release) throw createError("NotFoundError", { type: "Prompt", id: promptId })
    return c.json(release, 201)
  },
)
