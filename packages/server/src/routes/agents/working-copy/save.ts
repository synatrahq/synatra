import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { saveAgentWorkingCopy, SaveAgentWorkingCopySchema } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const saveWorkingCopy = new Hono().post(
  "/:id/working-copy/save",
  requirePermission("agent", "update"),
  zValidator("json", SaveAgentWorkingCopySchema.omit({ agentId: true })),
  async (c) => {
    const agentId = c.req.param("id")
    const body = c.req.valid("json")
    const result = await saveAgentWorkingCopy({ agentId, ...body })
    return c.json(result)
  },
)
