import { Hono } from "hono"
import {
  principal,
  startThreadFromTrigger,
  listActiveTriggersByAppAccountAndEvent,
  validateTriggerPromptConfig,
  findAppAccountsByAppIdAndWorkspaceId,
  findAppAccountsByAppIdAndInstallationId,
} from "@synatra/core"
import { getApp, normalizePayload, verifySignature } from "../apps"
import type { AppId } from "@synatra/core/types"
import { threadWorkflow } from "@synatra/workflows"
import { getTemporalClient } from "../temporal"
import { config } from "../config"
import { validatePayload } from "@synatra/util/validate"
import { createError } from "@synatra/util/error"

export const appWebhook = new Hono().post("/:appId/webhook", async (c) => {
  const appId = c.req.param("appId") as AppId

  const app = getApp(appId)
  if (!app) {
    throw createError("NotFoundError", { type: "App", id: appId })
  }

  const rawBody = await c.req.text()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw createError("BadRequestError", { message: "Invalid JSON payload" })
  }

  if (app.webhookSecretHeader) {
    const signature = c.req.header(app.webhookSecretHeader)
    if (!signature) {
      throw createError("ForbiddenError", { message: "Missing signature header" })
    }

    let secret: string | undefined
    if (appId === "github") {
      secret = config().github?.webhookSecret
      if (!secret) {
        throw createError("BadRequestError", { message: "GitHub webhook secret not configured" })
      }
    } else if (app.authType === "oauth2") {
      const oauthAppId = appId as "intercom"
      secret = config().oauth[oauthAppId]?.clientSecret
      if (!secret) {
        throw createError("BadRequestError", { message: "App OAuth not configured" })
      }
    } else {
      throw createError("BadRequestError", { message: "Webhook signature verification not supported for this app" })
    }

    if (!verifySignature(appId, rawBody, signature, secret)) {
      throw createError("ForbiddenError", { message: "Invalid signature" })
    }
  }

  let appAccounts: Awaited<ReturnType<typeof findAppAccountsByAppIdAndWorkspaceId>>
  let eventHeader: string | undefined

  if (appId === "github") {
    const installation = payload.installation as { id?: number } | undefined
    if (!installation || typeof installation.id !== "number") {
      throw createError("BadRequestError", { message: "Missing installation ID in payload" })
    }
    appAccounts = await findAppAccountsByAppIdAndInstallationId(appId, installation.id.toString())
    eventHeader = c.req.header("x-github-event") ?? undefined
  } else {
    const workspaceId = payload.app_id as string | undefined
    if (!workspaceId) {
      throw createError("BadRequestError", { message: "Missing workspace ID (app_id) in payload" })
    }
    appAccounts = await findAppAccountsByAppIdAndWorkspaceId(appId, workspaceId)
  }

  if (appAccounts.length === 0) {
    return c.json({ message: "No connected accounts for this installation" }, 200)
  }

  const normalized = normalizePayload(appId, payload, eventHeader) as Record<string, unknown>
  const eventType = (normalized as { event?: string }).event

  if (!eventType) {
    throw createError("BadRequestError", { message: "Missing event type in payload" })
  }

  const results: { threadId: string; triggerId: string }[] = []

  for (const appAccount of appAccounts) {
    const triggers = await listActiveTriggersByAppAccountAndEvent({ appAccountId: appAccount.id, eventType })

    for (const trigger of triggers) {
      if (trigger.payloadSchema) {
        const validation = validatePayload(normalized, trigger.payloadSchema)
        if (!validation.valid) continue
      }

      const configCheck = await validateTriggerPromptConfig({
        mode: trigger.mode,
        template: trigger.template,
        script: trigger.script,
        promptId: trigger.promptId,
        promptReleaseId: trigger.promptReleaseId,
        promptVersionMode: trigger.promptVersionMode,
      })
      if (!configCheck.ok) continue

      const result = await principal.withSystem({ organizationId: trigger.organizationId }, async () => {
        try {
          const threadResult = await startThreadFromTrigger({
            triggerId: trigger.triggerId,
            triggerSlug: trigger.slug,
            triggerReleaseId: trigger.currentReleaseId ?? undefined,
            agentId: trigger.agentId,
            agentVersionMode: trigger.agentVersionMode,
            agentReleaseId: trigger.agentReleaseId ?? undefined,
            channelId: trigger.channelId,
            environmentId: trigger.environmentId,
            payload: normalized,
          })

          const client = await getTemporalClient()
          await client.workflow.start(threadWorkflow, {
            taskQueue: config().temporal.taskQueue,
            workflowId: threadResult.thread.workflowId,
            args: [threadResult.workflowInput],
          })

          return { threadId: threadResult.thread.id, triggerId: trigger.triggerId }
        } catch {
          return null
        }
      })

      if (result) {
        results.push(result)
      }
    }
  }

  if (results.length === 0) {
    return c.json({ message: "No active triggers for this event" }, 200)
  }

  return c.json({ threads: results, count: results.length }, 202)
})
