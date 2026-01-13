import { Hono } from "hono"
import { getAgentById, approveAgentCopilotProposal } from "@synatra/core"
import { requirePermission } from "../../../../middleware/principal"
import { emitCopilotEvent } from "../threads/stream"
import { createError } from "@synatra/util/error"

export const approve = new Hono().post(
  "/:id/copilot/proposals/:proposalId/approve",
  requirePermission("agent", "update"),
  async (c) => {
    const agentId = c.req.param("id")
    const proposalId = c.req.param("proposalId")

    await getAgentById(agentId)
    const result = await approveAgentCopilotProposal({ agentId, proposalId })
    if (!result) throw createError("NotFoundError", { type: "CopilotProposal", id: proposalId })

    if (!result.alreadyDecided) {
      await emitCopilotEvent({
        threadId: result.thread.id,
        seq: result.seq,
        type: "copilot.proposal.approved",
        data: { proposal: result.proposal },
      })
    }

    return c.json({ success: true, proposal: result.proposal, alreadyDecided: result.alreadyDecided })
  },
)
