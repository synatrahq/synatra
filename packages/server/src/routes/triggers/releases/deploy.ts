import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import {
  deployTrigger,
  DeployTriggerSchema,
  getTriggerById,
  listTriggerEnvironments,
  getAgentById,
  principal,
} from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"
import { getScheduleId, updateSchedule } from "../schedule"

export const deploy = new Hono().post(
  "/:id/deploy",
  requirePermission("trigger", "update"),
  zValidator("json", DeployTriggerSchema.omit({ triggerId: true })),
  async (c) => {
    const triggerId = c.req.param("id")
    const body = c.req.valid("json")
    const release = await deployTrigger({ triggerId, ...body })
    if (!release) throw createError("NotFoundError", { type: "Trigger", id: triggerId })

    if (release.type === "schedule" && release.cron && release.timezone) {
      const trigger = await getTriggerById(triggerId)
      const environments = await listTriggerEnvironments(triggerId)
      const activeEnvs = environments.filter((e) => e.active)

      if (activeEnvs.length > 0) {
        const agent = await getAgentById(trigger.agentId!)
        const organizationId = principal.orgId()
        const agentReleaseId =
          release.agentVersionMode === "fixed"
            ? (release.agentReleaseId ?? agent.currentReleaseId ?? undefined)
            : undefined
        const payload = (release.input as Record<string, unknown>) ?? {}
        const subject = (payload.subject as string) || trigger.slug

        const failures: { environmentId: string; error: string }[] = []
        for (const env of activeEnvs) {
          const scheduleId = getScheduleId(triggerId, env.environmentId)
          try {
            await updateSchedule(scheduleId, {
              scheduleId,
              cron: release.cron,
              timezone: release.timezone,
              triggerId,
              triggerReleaseId: release.id,
              agentId: trigger.agentId!,
              agentReleaseId,
              agentVersionMode: release.agentVersionMode,
              organizationId,
              environmentId: env.environmentId,
              channelId: env.channelId,
              subject,
              payload,
            })
          } catch (error) {
            failures.push({
              environmentId: env.environmentId,
              error: error instanceof Error ? error.message : "Unknown error",
            })
          }
        }
        if (failures.length > 0) {
          console.warn("Schedule update failures:", failures)
        }
      }
    }

    return c.json(release, 201)
  },
)
