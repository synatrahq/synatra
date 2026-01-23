import { Hono } from "hono"
import { getTriggerById, listTriggerEnvironments, removeTrigger } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"
import { getScheduleId, deleteSchedule } from "./schedule"

export const remove = new Hono().delete("/:id", requirePermission("trigger", "delete"), async (c) => {
  const id = c.req.param("id")
  const trigger = await getTriggerById(id)
  if (trigger.type === "schedule") {
    const environments = await listTriggerEnvironments(id)
    for (const env of environments) {
      if (env.active) {
        await deleteSchedule(getScheduleId(env.id))
      }
    }
  }
  await removeTrigger(id)
  return c.json({ id, deleted: true })
})
