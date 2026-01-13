import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { updatePrompt, UpdatePromptSchema, getPromptByIdWithAgent } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"
import { createError } from "@synatra/util/error"

export const update = new Hono().patch(
  "/:id",
  requirePermission("prompt", "update"),
  zValidator("json", UpdatePromptSchema.omit({ id: true })),
  async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    await getPromptByIdWithAgent(id)
    const prompt = await updatePrompt({ id, ...body })
    if (!prompt) throw createError("NotFoundError", { type: "Prompt", id })
    return c.json(prompt)
  },
)
