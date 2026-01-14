import { Hono } from "hono"
import { getTriggerById, listTriggerEnvironments, removeTriggerEnvironment } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { getScheduleId, deleteSchedule } from "../schedule"

export const remove = new Hono().post(
  "/:id/environments/:environmentId/remove",
  requirePermission("trigger", "update"),
  async (c) => {
    const id = c.req.param("id")
    const environmentId = c.req.param("environmentId")
    const trigger = await getTriggerById(id)
    if (trigger.type === "schedule") {
      const environments = await listTriggerEnvironments(id)
      const env = environments.find((e) => e.environmentId === environmentId)
      if (env?.active) {
        await deleteSchedule(getScheduleId(id, environmentId))
      }
    }

    await removeTriggerEnvironment({ triggerId: id, environmentId })
    return c.json({ success: true })
  },
)
