import { Hono } from "hono"
import type { PromptConfigOverride } from "@synatra/core/types"
import {
  principal,
  findTriggerByRunPath,
  validateTriggerPromptConfig,
  startThreadFromTrigger,
  findPromptByRelease,
  findPromptById,
} from "@synatra/core"
import { threadWorkflow } from "@synatra/workflows"
import { getTemporalClient } from "../temporal"
import { config } from "../config"
import { validatePayload } from "@synatra/util/validate"
import { extractBearerToken, verifySecret } from "../util/bearer-auth"
import { createError } from "@synatra/util/error"

export const triggerRun = new Hono().post("/:orgSlug/:envSlug/:triggerSlug/:version/run", async (c) => {
  const { orgSlug, envSlug, triggerSlug, version } = c.req.param()

  const trigger = await findTriggerByRunPath({ orgSlug, envSlug, triggerSlug, version })
  if (!trigger) throw createError("NotFoundError", { type: "Trigger" })

  const token = extractBearerToken(c.req.header("Authorization"))
  if (!token) throw createError("UnauthorizedError", { message: "Missing authorization header" })
  if (!trigger.debug_secret)
    throw createError("ForbiddenError", { message: "Debug run not configured for this trigger" })
  if (!verifySecret(token, trigger.debug_secret))
    throw createError("UnauthorizedError", { message: "Invalid debug secret" })

  const payload = await c.req.json().catch(() => ({}))
  if (trigger.payload_schema) {
    const validation = validatePayload(payload, trigger.payload_schema)
    if (!validation.valid)
      throw createError("BadRequestError", { message: `Invalid payload: ${validation.errors.join(", ")}` })
  }

  const configCheck = await validateTriggerPromptConfig({
    mode: trigger.mode,
    template: trigger.template,
    script: trigger.script,
    promptId: trigger.prompt_id,
    promptReleaseId: trigger.prompt_release_id,
    promptVersionMode: trigger.prompt_version_mode,
  })
  if (!configCheck.ok) throw createError("BadRequestError", { message: configCheck.message })

  return principal.withSystem({ organizationId: trigger.organization_id }, async () => {
    const isPreview = version === "preview"
    const isLatest = version === "latest"
    const triggerReleaseId = isPreview ? undefined : (trigger.release_id ?? undefined)

    let promptConfigOverride: PromptConfigOverride | undefined
    if (!isLatest) {
      if (trigger.mode === "template" && trigger.template) {
        promptConfigOverride = { mode: "template", template: trigger.template }
      } else if (trigger.mode === "script" && trigger.script) {
        promptConfigOverride = { mode: "script", script: trigger.script, source: "trigger" }
      } else if (trigger.mode === "prompt" && trigger.prompt_id) {
        const useFixed = trigger.prompt_version_mode === "fixed" && trigger.prompt_release_id
        const promptData = useFixed
          ? await findPromptByRelease({ promptId: trigger.prompt_id, releaseId: trigger.prompt_release_id! })
          : await findPromptById(trigger.prompt_id)

        if (promptData?.mode === "script" && promptData.script) {
          promptConfigOverride = { mode: "script", script: promptData.script, source: "prompt" }
        } else if (promptData?.content) {
          promptConfigOverride = { mode: "template", template: promptData.content }
        }
      }
    }

    const result = await startThreadFromTrigger({
      triggerId: trigger.trigger_id,
      triggerSlug: trigger.slug,
      triggerReleaseId,
      agentId: trigger.agent_id,
      agentVersionMode: trigger.agent_version_mode,
      agentReleaseId: trigger.agent_release_id ?? undefined,
      channelId: trigger.channel_id,
      environmentId: trigger.environment_id,
      payload,
      isDebug: true,
      promptConfigOverride,
    })

    const client = await getTemporalClient()
    await client.workflow.start(threadWorkflow, {
      taskQueue: config().temporal.taskQueue,
      workflowId: result.thread.workflowId,
      args: [result.workflowInput],
    })

    return c.json({ threadId: result.thread.id, status: "active", isDebug: true, version }, 202)
  })
})
