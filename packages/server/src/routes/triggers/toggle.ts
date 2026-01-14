import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  getTriggerById,
  listTriggerEnvironments,
  toggleTriggerEnvironment,
  getAgentById,
  principal,
} from "@synatra/core"
import { getTemporalClient } from "../../temporal"
import { requirePermission } from "../../middleware/principal"
import { getScheduleId, createSchedule, deleteSchedule } from "./schedule"
import { createError } from "@synatra/util/error"

export const toggle = new Hono().post(
  "/:id/toggle",
  requirePermission("trigger", "update"),
  zValidator("json", z.object({ environmentId: z.string() })),
  async (c) => {
    const id = c.req.param("id")
    const { environmentId } = c.req.valid("json")
    const organizationId = principal.orgId()

    const trigger = await getTriggerById(id)

    const environments = await listTriggerEnvironments(id)
    const env = environments.find((e) => e.environmentId === environmentId)
    if (!env) {
      throw createError("NotFoundError", { type: "TriggerEnvironment", id: environmentId })
    }

    const willBeActive = !env.active

    if (trigger.type === "schedule") {
      if (!trigger.cron || !trigger.timezone) {
        throw createError("BadRequestError", { message: "Schedule requires cron and timezone" })
      }
      const agent = await getAgentById(trigger.agentId!)
      if (!agent.currentReleaseId || !agent.configHash) {
        throw createError("BadRequestError", { message: "Agent has no published release" })
      }

      const scheduleId = getScheduleId(trigger.id, environmentId)

      if (willBeActive) {
        const releaseId =
          trigger.agentVersionMode === "fixed" ? (trigger.agentReleaseId ?? agent.currentReleaseId) : undefined
        const payload = (trigger.input as Record<string, unknown>) ?? {}
        const subject = (payload.subject as string) || trigger.slug

        const updated = await toggleTriggerEnvironment({ triggerId: id, environmentId })
        try {
          await deleteSchedule(scheduleId)
          await createSchedule({
            scheduleId,
            cron: trigger.cron,
            timezone: trigger.timezone!,
            triggerId: trigger.id,
            triggerReleaseId: trigger.currentReleaseId ?? undefined,
            agentId: trigger.agentId!,
            agentReleaseId: releaseId,
            agentVersionMode: trigger.agentVersionMode!,
            organizationId,
            environmentId,
            channelId: env.channelId,
            subject,
            payload,
          })
        } catch (error) {
          await toggleTriggerEnvironment({ triggerId: id, environmentId })
          throw createError("BadRequestError", {
            message: `Failed to create schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
          })
        }
        return c.json(updated)
      }

      const client = await getTemporalClient()
      const handle = client.schedule.getHandle(scheduleId)
      try {
        await handle.pause()
      } catch (error) {
        const msg = error instanceof Error ? error.message : ""
        if (!msg.includes("not found") && !msg.includes("NotFound")) {
          throw createError("BadRequestError", {
            message: `Failed to pause schedule: ${msg || "Unknown error"}`,
          })
        }
      }
    }

    const updated = await toggleTriggerEnvironment({ triggerId: id, environmentId })
    return c.json(updated)
  },
)
