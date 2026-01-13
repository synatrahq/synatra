import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { StartThreadSchema, startThread } from "@synatra/core"
import { threadWorkflow } from "@synatra/workflows"
import { getTemporalClient } from "../../temporal"
import { config } from "../../config"
import { emitThreadEvent } from "./stream"

export const create = new Hono().post("/", zValidator("json", StartThreadSchema), async (c) => {
  const result = await startThread(c.req.valid("json"))

  if (result.message) {
    await emitThreadEvent({
      threadId: result.thread.id,
      seq: result.messageSeq,
      type: "message.created",
      data: { message: result.message },
      updatedAt: result.messageUpdatedAt ?? undefined,
    })
  }

  const client = await getTemporalClient()
  await client.workflow.start(threadWorkflow, {
    taskQueue: config().temporal.taskQueue,
    workflowId: result.thread.workflowId,
    args: [result.workflowInput],
  })

  return c.json({ id: result.thread.id, status: "active" }, 202)
})
