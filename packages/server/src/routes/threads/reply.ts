import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { ReplyThreadSchema, replyThread } from "@synatra/core"
import { threadWorkflow, userMessageSignal } from "@synatra/workflows"
import { getTemporalClient } from "../../temporal"
import { emitThreadStatusChanged, emitThreadEvent } from "./stream"
import { config } from "../../config"

export const reply = new Hono().post(
  "/:id/reply",
  zValidator("json", ReplyThreadSchema.omit({ threadId: true })),
  async (c) => {
    const threadId = c.req.param("id")
    const result = await replyThread({ threadId, ...c.req.valid("json") })

    await emitThreadEvent({
      threadId,
      seq: result.messageSeq,
      type: "message.created",
      data: { message: result.message },
      updatedAt: result.messageUpdatedAt ?? undefined,
    })

    const client = await getTemporalClient()

    if (result.action === "signal") {
      const handle = client.workflow.getHandle(result.thread.workflowId)
      await handle.signal(userMessageSignal, result.signalPayload)
      return c.json({ id: threadId, status: "active" }, 202)
    }

    await emitThreadStatusChanged({
      threadId,
      seq: result.statusSeq,
      status: result.thread.status,
      updatedAt: result.statusUpdatedAt,
    })

    await client.workflow.start(threadWorkflow, {
      taskQueue: config().temporal.taskQueue,
      workflowId: result.thread.workflowId,
      args: [result.workflowInput],
    })

    return c.json({ id: threadId, status: "active" }, 202)
  },
)
