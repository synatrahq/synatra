import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  principal,
  getAgentById,
  findAgentCopilotThreadWithAuth,
  createAgentCopilotThread,
  createAgentCopilotMessage,
  getAgentTemplateById,
  listResources,
} from "@synatra/core"
import { requirePermission } from "../../../../../middleware/principal"
import { emitCopilotEvent } from "../stream"
import type { AgentRuntimeConfig } from "@synatra/core/types"
import type { TemplateInfo } from "../../copilot-prompt"
import { runCopilotLLM, type ResourceInfo } from "./run-llm"
import { createError } from "@synatra/util/error"

const schema = z.object({
  message: z.string().min(1),
  threadId: z.uuid().optional(),
  currentConfig: z.unknown(),
  pendingProposalConfig: z.unknown().optional(),
  environmentId: z.uuid().optional(),
  model: z.string().optional(),
})

export const create = new Hono().post(
  "/:id/copilot/messages",
  requirePermission("agent", "update"),
  zValidator("json", schema),
  async (c) => {
    const agentId = c.req.param("id")
    const body = c.req.valid("json")
    const currentConfig = body.currentConfig as AgentRuntimeConfig

    const agent = await getAgentById(agentId)

    let template: TemplateInfo | null = null
    if (agent.templateId) {
      const templateData = await getAgentTemplateById(agent.templateId)
      if (templateData) {
        template = {
          name: templateData.name,
          prompt: templateData.prompt,
          suggestedResources: templateData.suggestedResources as string[],
        }
      }
    }

    const allResources = await listResources()
    const resources: ResourceInfo[] = allResources.map((r) => ({
      id: r.id,
      slug: r.slug,
      type: r.type,
      description: r.description,
    }))

    let thread: { id: string; seq: number }
    let threadCreated = false

    if (body.threadId) {
      const existing = await findAgentCopilotThreadWithAuth({
        threadId: body.threadId,
        agentId,
      })
      if (!existing) throw createError("NotFoundError", { type: "CopilotThread", id: body.threadId })
      thread = { id: existing.id, seq: existing.seq }
    } else {
      const title = body.message.slice(0, 50) + (body.message.length > 50 ? "..." : "")
      const created = await createAgentCopilotThread({ agentId, title })
      thread = { id: created.id, seq: created.seq }
      threadCreated = true
    }

    const userMessage = await createAgentCopilotMessage({
      threadId: thread.id,
      role: "user",
      content: body.message,
    })

    let currentSeq = thread.seq + 1
    await emitCopilotEvent({
      threadId: thread.id,
      seq: currentSeq,
      type: "copilot.message.created",
      data: { message: userMessage },
    })

    currentSeq++
    await emitCopilotEvent({
      threadId: thread.id,
      seq: currentSeq,
      type: "copilot.thinking",
      data: {},
    })

    const pendingProposalConfig = body.pendingProposalConfig ? (body.pendingProposalConfig as AgentRuntimeConfig) : null

    const organizationId = principal.orgId()
    runCopilotLLM({
      organizationId,
      threadId: thread.id,
      agentId,
      message: body.message,
      currentConfig,
      pendingProposalConfig,
      resources,
      environmentId: body.environmentId ?? null,
      initialSeq: currentSeq,
      modelId: body.model,
      template,
    }).catch((err) => console.error("Copilot LLM error:", err))

    return c.json(
      {
        success: true,
        threadId: thread.id,
        threadCreated,
        message: userMessage,
      },
      202,
    )
  },
)
