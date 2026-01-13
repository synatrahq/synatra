import { Hono } from "hono"
import { adoptTrigger } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const adopt = new Hono().post(
  "/:id/releases/:releaseId/adopt",
  requirePermission("trigger", "update"),
  async (c) => {
    const triggerId = c.req.param("id")
    const releaseId = c.req.param("releaseId")

    const release = await adoptTrigger({ triggerId, releaseId })
    if (!release) throw createError("NotFoundError", { type: "TriggerRelease", id: releaseId })
    return c.json(release)
  },
)
