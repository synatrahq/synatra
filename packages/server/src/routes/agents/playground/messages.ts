import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  principal,
  getAgentById,
  getThreadById,
  incrementThreadSeq,
  reactivateThread,
  createMessage,
  getEnvironmentById,
  pendingHumanRequestByThread,
} from "@synatra/core"
import { AgentRuntimeConfigSchema } from "@synatra/core/types"
import { playgroundWorkflow, playgroundUserMessageSignal } from "@synatra/workflows"
import { getTemporalClient } from "../../../temporal"
import { config } from "../../../config"
import { emitThreadEvent } from "./stream"
import { createError } from "@synatra/util/error"

const messageSchema = z.object({
  sessionId: z.string(),
  environmentId: z.string(),
  runtimeConfig: AgentRuntimeConfigSchema,
  message: z.string().min(1),
})

export const messages = new Hono().post("/:id/playground/messages", zValidator("json", messageSchema), async (c) => {
  const agentId = c.req.param("id")
  const data = c.req.valid("json")
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const agent = await getAgentById(agentId)
  const thread = await getThreadById(data.sessionId)
  if (thread.agentId !== agentId || thread.userId !== userId) {
    throw createError("NotFoundError", { type: "Thread", id: data.sessionId })
  }

  await getEnvironmentById(data.environmentId)

  const message = await createMessage({
    threadId: thread.id,
    type: "user",
    content: data.message,
  })

  const seqResult = await incrementThreadSeq({ id: thread.id })
  if (seqResult) {
    await emitThreadEvent({
      threadId: thread.id,
      seq: seqResult.seq,
      type: "message.created",
      data: { message },
      updatedAt: seqResult.updatedAt ?? undefined,
    })
  }

  if (thread.status === "waiting_human") {
    const pending = await pendingHumanRequestByThread(thread.id)
    if (pending && pending.kind !== "approval") {
      const client = await getTemporalClient()
      const handle = client.workflow.getHandle(thread.workflowId)

      await handle.signal(playgroundUserMessageSignal, {
        message: data.message,
        messageId: message.id,
        userId,
      })

      return c.json({ sessionId: thread.id, status: "signaled" }, 202)
    }
  }

  const reactivated = await reactivateThread({ id: thread.id })
  if (!reactivated) {
    const fresh = await getThreadById(thread.id)
    if (fresh?.status === "running") {
      return c.json({ sessionId: thread.id, status: "already_running" })
    }
    if (!fresh) {
      throw createError("NotFoundError", { type: "Thread", id: thread.id })
    }
    throw createError("ConflictError", { message: `Cannot send message to session with status: ${fresh.status}` })
  }

  const client = await getTemporalClient()

  try {
    await client.workflow.start(playgroundWorkflow, {
      taskQueue: config().temporal.taskQueue,
      workflowId: thread.workflowId!,
      args: [
        {
          sessionId: thread.id,
          agentId: agent.id,
          organizationId,
          environmentId: data.environmentId,
          runtimeConfig: data.runtimeConfig,
          message: data.message,
          userId,
        },
      ],
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("already started")) {
      return c.json({ sessionId: thread.id, status: "already_running" })
    }
    throw error
  }

  const statusSeq = await incrementThreadSeq({ id: thread.id })
  if (statusSeq) {
    await emitThreadEvent({
      threadId: thread.id,
      seq: statusSeq.seq,
      type: "session.status_changed",
      data: { status: "running" },
    })
  }

  return c.json({ sessionId: thread.id, status: "started" }, 202)
})
