import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { savePromptWorkingCopy, SavePromptWorkingCopySchema } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const saveWorkingCopy = new Hono().post(
  "/:id/working-copy/save",
  requirePermission("prompt", "update"),
  zValidator("json", SavePromptWorkingCopySchema.omit({ promptId: true })),
  async (c) => {
    const promptId = c.req.param("id")
    const body = c.req.valid("json")
    const result = await savePromptWorkingCopy({ promptId, ...body })
    return c.json(result)
  },
)
