import { Hono } from "hono"
import {
  getAgentById,
  completeAgentCopilotTriggerRequest,
  createTrigger,
  saveTriggerWorkingCopy,
  updateTrigger,
  getTriggerById,
} from "@synatra/core"
import { requirePermission } from "../../../../middleware/principal"
import { emitCopilotEvent } from "../threads/stream"
import { createError } from "@synatra/util/error"

export const complete = new Hono().post(
  "/:id/copilot/trigger-requests/:requestId/complete",
  requirePermission("agent", "update"),
  async (c) => {
    const agentId = c.req.param("id")
    const requestId = c.req.param("requestId")

    await getAgentById(agentId)
    const result = await completeAgentCopilotTriggerRequest({ agentId, requestId })
    if (!result) throw createError("NotFoundError", { type: "CopilotTriggerRequest", id: requestId })

    if (!result.alreadyDecided) {
      const config = result.request.config as Record<string, unknown>

      if (result.request.action === "create") {
        const trigger = await createTrigger({
          name: (config.name as string) ?? "New Trigger",
          agentId,
          agentVersionMode: "current",
          promptVersionMode: "current",
          type: (config.type as "webhook" | "schedule" | "app") ?? "webhook",
          mode: (config.mode as "prompt" | "template" | "script") ?? "template",
          template: (config.template as string) ?? "",
          script: (config.script as string) ?? "",
          cron: (config.cron as string) ?? undefined,
          timezone: (config.timezone as string) ?? "UTC",
          appAccountId: (config.appAccountId as string) ?? undefined,
          appEvents: (config.appEvents as string[]) ?? undefined,
        })

        await emitCopilotEvent({
          threadId: result.thread.id,
          seq: result.seq,
          type: "copilot.trigger_request.completed",
          data: {
            triggerRequest: result.request,
            trigger,
          },
        })

        return c.json({ success: true, request: result.request, trigger, alreadyDecided: false })
      }

      if (result.request.action === "update") {
        if (!result.request.triggerId) {
          throw new Error("triggerId is required for update action")
        }
        await saveTriggerWorkingCopy({
          triggerId: result.request.triggerId,
          type: config.type as "webhook" | "schedule" | "app" | undefined,
          mode: config.mode as "prompt" | "template" | "script" | undefined,
          template: config.template as string | undefined,
          script: config.script as string | undefined,
          cron: config.cron as string | null | undefined,
          timezone: config.timezone as string | undefined,
          appAccountId: config.appAccountId as string | null | undefined,
          appEvents: config.appEvents as string[] | null | undefined,
        })

        if (config.name) {
          await updateTrigger({ id: result.request.triggerId, name: config.name as string })
        }

        const trigger = await getTriggerById(result.request.triggerId)

        await emitCopilotEvent({
          threadId: result.thread.id,
          seq: result.seq,
          type: "copilot.trigger_request.completed",
          data: {
            triggerRequest: result.request,
            trigger,
          },
        })

        return c.json({ success: true, request: result.request, trigger, alreadyDecided: false })
      }
    }

    return c.json({ success: true, request: result.request, alreadyDecided: result.alreadyDecided })
  },
)
