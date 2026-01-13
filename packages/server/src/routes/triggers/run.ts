import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  getTriggerById,
  listTriggerEnvironments,
  validateTriggerPromptConfig,
  startThreadFromTrigger,
  principal,
} from "@synatra/core"
import { threadWorkflow } from "@synatra/workflows"
import { getTemporalClient } from "../../temporal"
import { requirePermission } from "../../middleware/principal"
import { config } from "../../config"
import { createError } from "@synatra/util/error"

export const run = new Hono().post(
  "/:id/run",
  requirePermission("trigger", "update"),
  zValidator(
    "json",
    z.object({
      environmentId: z.string(),
      payload: z.record(z.string(), z.unknown()).optional().default({}),
    }),
  ),
  async (c) => {
    const id = c.req.param("id")
    const { environmentId, payload } = c.req.valid("json")

    const trigger = await getTriggerById(id)
    if (!trigger.agentId) throw createError("BadRequestError", { message: "Trigger has no agent configured" })

    const environments = await listTriggerEnvironments(id)
    const env = environments.find((e) => e.environmentId === environmentId)
    if (!env) throw createError("NotFoundError", { type: "TriggerEnvironment", id: environmentId })

    const configCheck = await validateTriggerPromptConfig({
      mode: trigger.mode,
      template: trigger.template,
      script: trigger.script,
      promptId: trigger.promptId,
      promptReleaseId: trigger.promptReleaseId,
      promptVersionMode: trigger.promptVersionMode,
    })
    if (!configCheck.ok) throw createError("BadRequestError", { message: configCheck.message })

    const result = await startThreadFromTrigger({
      triggerId: trigger.id,
      triggerSlug: trigger.slug,
      triggerReleaseId: trigger.currentReleaseId ?? undefined,
      agentId: trigger.agentId,
      agentVersionMode: trigger.agentVersionMode!,
      agentReleaseId: trigger.agentReleaseId ?? undefined,
      channelId: env.channelId,
      environmentId,
      payload,
      createdBy: principal.userId(),
    })

    const client = await getTemporalClient()
    await client.workflow.start(threadWorkflow, {
      taskQueue: config().temporal.taskQueue,
      workflowId: result.thread.workflowId,
      args: [result.workflowInput],
    })

    return c.json({ threadId: result.thread.id, status: "active" }, 202)
  },
)
