import { Hono } from "hono"
import {
  principal,
  getAgentById,
  getOrCreatePlaygroundThread,
  clearPlaygroundThread,
  findProductionEnvironment,
} from "@synatra/core"
import { getTemporalClient } from "../../../temporal"
import { clearThreadStream } from "./stream"
import { createError } from "@synatra/util/error"

export const session = new Hono()
  .get("/:id/playground/session", async (c) => {
    const agentId = c.req.param("id")
    const organizationId = principal.orgId()
    const userId = principal.userId()

    await getAgentById(agentId)
    const environment = await findProductionEnvironment(organizationId)
    if (!environment) {
      throw createError("NotFoundError", { type: "Environment", id: "production" })
    }

    const { thread } = await getOrCreatePlaygroundThread({
      organizationId,
      environmentId: environment.id,
      agentId,
      userId,
    })

    if (!thread) {
      throw createError("NotFoundError", { type: "Thread", id: "playground" })
    }

    return c.json({
      session: {
        id: thread.id,
        agentId: thread.agentId,
        status: thread.status,
        seq: thread.seq,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
      },
      messages: thread.messages.map((m) => ({
        id: m.id,
        runId: m.runId,
        type: m.type,
        content: m.content,
        toolCall: m.toolCall,
        toolResult: m.toolResult,
        createdAt: m.createdAt.toISOString(),
      })),
      runs: thread.runs.map((r) => ({
        id: r.id,
        threadId: r.threadId,
        parentRunId: r.parentRunId,
        agentId: r.agentId,
        agentReleaseId: r.agentReleaseId,
        depth: r.depth,
        status: r.status,
        input: r.input,
        output: r.output,
        error: r.error,
        startedAt: r.startedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        agent: r.agent,
      })),
      humanRequests: thread.humanRequests.map((hr) => ({
        id: hr.id,
        threadId: hr.threadId,
        runId: hr.runId,
        toolCallId: hr.toolCallId,
        kind: hr.kind,
        title: hr.title,
        description: hr.description,
        config: hr.config,
        authority: hr.authority,
        timeoutMs: hr.timeoutMs,
        fallback: hr.fallback,
        expiresAt: hr.expiresAt?.toISOString() ?? null,
        status: hr.status,
        createdAt: hr.createdAt.toISOString(),
        updatedAt: hr.updatedAt.toISOString(),
      })),
      humanResponses: thread.humanResponses.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        status: r.status,
        respondedBy: r.respondedBy,
        data: r.data,
        createdAt: r.createdAt.toISOString(),
      })),
      outputItems: thread.outputItems.map((o) => ({
        id: o.id,
        threadId: o.threadId,
        runId: o.runId,
        toolCallId: o.toolCallId,
        kind: o.kind,
        name: o.name,
        payload: o.payload,
        createdAt: o.createdAt.toISOString(),
      })),
    })
  })
  .post("/:id/playground/session", async (c) => {
    const agentId = c.req.param("id")
    const organizationId = principal.orgId()
    const userId = principal.userId()

    await getAgentById(agentId)
    const environment = await findProductionEnvironment(organizationId)
    if (!environment) {
      throw createError("NotFoundError", { type: "Environment", id: "production" })
    }

    const { thread, created } = await getOrCreatePlaygroundThread({
      organizationId,
      environmentId: environment.id,
      agentId,
      userId,
    })

    if (!thread) {
      throw createError("NotFoundError", { type: "Thread", id: "playground" })
    }

    return c.json({
      session: {
        id: thread.id,
        agentId: thread.agentId,
        status: thread.status,
        seq: thread.seq,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
      },
      created,
    })
  })
  .post("/:id/playground/session/clear", async (c) => {
    const agentId = c.req.param("id")
    const organizationId = principal.orgId()
    const userId = principal.userId()

    await getAgentById(agentId)
    const environment = await findProductionEnvironment(organizationId)
    if (!environment) {
      throw createError("NotFoundError", { type: "Environment", id: "production" })
    }

    const { thread } = await getOrCreatePlaygroundThread({
      organizationId,
      environmentId: environment.id,
      agentId,
      userId,
    })

    if (!thread) {
      throw createError("NotFoundError", { type: "Thread", id: "playground" })
    }

    if (thread.workflowId) {
      try {
        const client = await getTemporalClient()
        const handle = client.workflow.getHandle(thread.workflowId)
        await handle.cancel()
      } catch {
        // Ignore workflow not found errors
      }
    }

    await clearPlaygroundThread(thread.id)
    await clearThreadStream(thread.id)

    return c.json({ success: true })
  })
