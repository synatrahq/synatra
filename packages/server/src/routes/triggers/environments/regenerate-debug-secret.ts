import { Hono } from "hono"
import { getTriggerById, regenerateTriggerDebugSecret, principal } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const regenerateDebugSecret = new Hono().post(
  "/:id/environments/:environmentId/regenerate-debug-secret",
  requirePermission("trigger", "update"),
  async (c) => {
    const id = c.req.param("id")
    const environmentId = c.req.param("environmentId")
    const organizationId = principal.orgId()

    const trigger = await getTriggerById(id)
    if (!trigger || trigger.organizationId !== organizationId) {
      throw createError("NotFoundError", { type: "Trigger", id })
    }

    const result = await regenerateTriggerDebugSecret({ triggerId: id, environmentId })
    return c.json(result)
  },
)
