import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import {
  getTriggerById,
  updateTriggerEnvironment,
  UpdateTriggerEnvironmentSchema,
  getChannelById,
  listTriggerEnvironments,
  getAgentById,
  principal,
} from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { getScheduleId, updateSchedule } from "../schedule"

export const update = new Hono().patch(
  "/:id/environments/:environmentId",
  requirePermission("trigger", "update"),
  zValidator("json", UpdateTriggerEnvironmentSchema.omit({ triggerId: true, environmentId: true })),
  async (c) => {
    const triggerId = c.req.param("id")
    const environmentId = c.req.param("environmentId")
    const body = c.req.valid("json")
    const trigger = await getTriggerById(triggerId)
    if (body.channelId) await getChannelById(body.channelId)
    const result = await updateTriggerEnvironment({ triggerId, environmentId, ...body })

    if (body.channelId && trigger.type === "schedule" && trigger.cron && trigger.timezone) {
      const environments = await listTriggerEnvironments(triggerId)
      const env = environments.find((e) => e.environmentId === environmentId)
      if (env?.active) {
        const agent = await getAgentById(trigger.agentId!)
        const organizationId = principal.orgId()
        const agentReleaseId =
          trigger.agentVersionMode === "fixed"
            ? (trigger.agentReleaseId ?? agent.currentReleaseId ?? undefined)
            : undefined
        const payload = (trigger.input as Record<string, unknown>) ?? {}
        const subject = (payload.subject as string) || trigger.slug

        await updateSchedule(getScheduleId(triggerId, environmentId), {
          scheduleId: getScheduleId(triggerId, environmentId),
          cron: trigger.cron,
          timezone: trigger.timezone,
          triggerId,
          triggerReleaseId: trigger.currentReleaseId ?? undefined,
          agentId: trigger.agentId!,
          agentReleaseId,
          agentVersionMode: trigger.agentVersionMode!,
          organizationId,
          environmentId,
          channelId: body.channelId,
          subject,
          payload,
        })
      }
    }

    return c.json(result)
  },
)
