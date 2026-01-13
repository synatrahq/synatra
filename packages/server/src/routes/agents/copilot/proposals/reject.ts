import { Hono } from "hono"
import { getAgentById, rejectAgentCopilotProposal } from "@synatra/core"
import { requirePermission } from "../../../../middleware/principal"
import { emitCopilotEvent } from "../threads/stream"
import { createError } from "@synatra/util/error"

export const reject = new Hono().post(
  "/:id/copilot/proposals/:proposalId/reject",
  requirePermission("agent", "update"),
  async (c) => {
    const agentId = c.req.param("id")
    const proposalId = c.req.param("proposalId")

    await getAgentById(agentId)
    const result = await rejectAgentCopilotProposal({ agentId, proposalId })
    if (!result) throw createError("NotFoundError", { type: "CopilotProposal", id: proposalId })

    if (!result.alreadyDecided) {
      await emitCopilotEvent({
        threadId: result.thread.id,
        seq: result.seq,
        type: "copilot.proposal.rejected",
        data: { proposal: result.proposal },
      })
    }

    return c.json({ success: true, proposal: result.proposal, alreadyDecided: result.alreadyDecided })
  },
)
