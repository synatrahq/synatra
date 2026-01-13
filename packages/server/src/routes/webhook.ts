import { Hono } from "hono"
import { principal, findTriggerByWebhookPath, validateTriggerPromptConfig, startThreadFromTrigger } from "@synatra/core"
import { threadWorkflow } from "@synatra/workflows"
import { getTemporalClient } from "../temporal"
import { config } from "../config"
import { validatePayload } from "@synatra/util/validate"
import { extractBearerToken, verifySecret } from "../util/bearer-auth"
import { createError } from "@synatra/util/error"

export const webhook = new Hono().post("/:orgSlug/:envSlug/:triggerSlug", async (c) => {
  const { orgSlug, envSlug, triggerSlug } = c.req.param()

  const trigger = await findTriggerByWebhookPath({ orgSlug, envSlug, triggerSlug })
  if (!trigger) throw createError("NotFoundError", { type: "Trigger" })
  if (!trigger.is_active) throw createError("ForbiddenError", { message: "Trigger is disabled" })

  const configCheck = await validateTriggerPromptConfig({
    mode: trigger.mode,
    template: trigger.template,
    script: trigger.script,
    promptId: trigger.prompt_id,
    promptReleaseId: trigger.prompt_release_id,
    promptVersionMode: trigger.prompt_version_mode,
  })
  if (!configCheck.ok) throw createError("BadRequestError", { message: configCheck.message })

  const token = extractBearerToken(c.req.header("Authorization"))
  if (!token) throw createError("UnauthorizedError", { message: "Missing authorization header" })
  if (!trigger.webhook_secret)
    throw createError("ForbiddenError", { message: "Webhook not configured for this trigger" })
  if (!verifySecret(token, trigger.webhook_secret))
    throw createError("UnauthorizedError", { message: "Invalid webhook secret" })

  const payload = await c.req.json().catch(() => ({}))
  if (trigger.payload_schema) {
    const validation = validatePayload(payload, trigger.payload_schema)
    if (!validation.valid)
      throw createError("BadRequestError", { message: `Invalid payload: ${validation.errors.join(", ")}` })
  }

  return principal.withSystem({ organizationId: trigger.organization_id }, async () => {
    const result = await startThreadFromTrigger({
      triggerId: trigger.trigger_id,
      triggerSlug: trigger.slug,
      triggerReleaseId: trigger.current_release_id ?? undefined,
      agentId: trigger.agent_id,
      agentVersionMode: trigger.agent_version_mode,
      agentReleaseId: trigger.agent_release_id ?? undefined,
      channelId: trigger.channel_id,
      environmentId: trigger.environment_id,
      payload,
    })

    const client = await getTemporalClient()
    await client.workflow.start(threadWorkflow, {
      taskQueue: config().temporal.taskQueue,
      workflowId: result.thread.workflowId,
      args: [result.workflowInput],
    })

    return c.json({ threadId: result.thread.id, status: "active" }, 202)
  })
})
