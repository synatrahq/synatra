import { Hono } from "hono"
import { WorkflowNotFoundError } from "@temporalio/client"
import { getThreadById, removeThread, principal, canAccessCurrentUserChannelMember } from "@synatra/core"
import { getTemporalClient } from "../../temporal"
import { createError } from "@synatra/util/error"

export const remove = new Hono().delete("/:id", async (c) => {
  const id = c.req.param("id")
  const thread = await getThreadById(id)
  if (thread.channelId) {
    const hasAccess = await canAccessCurrentUserChannelMember(thread.channelId)
    if (!hasAccess) {
      throw createError("ForbiddenError", { message: "No access to this channel" })
    }
  } else if (thread.createdBy !== principal.userId()) {
    throw createError("ForbiddenError", { message: "No access to this thread" })
  }

  const client = await getTemporalClient()
  const handle = client.workflow.getHandle(thread.workflowId)

  try {
    await handle.terminate("Thread deleted")
  } catch (error) {
    if (!(error instanceof WorkflowNotFoundError)) {
      const message = error instanceof Error ? error.message : "Failed to terminate workflow"
      throw createError("BadRequestError", { message })
    }
  }

  const deleted = await removeThread({ id })
  if (!deleted) throw createError("NotFoundError", { type: "thread", id })

  return c.json({ status: "terminated_and_deleted" })
})
