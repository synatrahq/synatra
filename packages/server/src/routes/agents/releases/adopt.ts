import { Hono } from "hono"
import { adoptAgent } from "@synatra/core"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { requirePermission } from "../../../middleware/principal"

export const adopt = new Hono().post(
  "/:id/releases/:releaseId/adopt",
  requirePermission("agent", "update"),
  zValidator("json", z.object({})),
  async (c) => {
    const params = c.req.param()
    const release = await adoptAgent({ agentId: params.id, releaseId: params.releaseId })
    return c.json(release)
  },
)
