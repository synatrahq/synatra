import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  principal,
  getAgentById,
  getAgentTemplateById,
  findAgentCopilotThreadWithAuth,
  getPendingAgentCopilotQuestionRequest,
  answerAgentCopilotQuestionRequest,
  createAgentCopilotMessage,
  listResources,
} from "@synatra/core"
import { requirePermission } from "../../../../middleware/principal"
import { emitCopilotEvent } from "../threads/stream"
import { UserConfigurableResourceType, type AgentRuntimeConfig, type AskQuestionsResult } from "@synatra/core/types"
import type { TemplateInfo } from "../copilot-prompt"
import { runCopilotLLMWithToolResult, type ResourceInfo } from "../threads/messages/run-llm"
import { createError } from "@synatra/util/error"

const answerSchema = z.object({
  questionIndex: z.number(),
  selected: z.array(z.string()),
  otherText: z.string().optional(),
})

const schema = z.object({
  threadId: z.uuid(),
  toolCallId: z.string(),
  answers: z.array(answerSchema),
  currentConfig: z.unknown(),
  pendingProposalConfig: z.unknown().optional(),
  environmentId: z.uuid().optional(),
  model: z.string().optional(),
})

export const submit = new Hono().post(
  "/:id/copilot/widgets/submit",
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

    const thread = await findAgentCopilotThreadWithAuth({ threadId: body.threadId, agentId })
    if (!thread) throw createError("NotFoundError", { type: "CopilotThread", id: body.threadId })

    const questionRequest = await getPendingAgentCopilotQuestionRequest({
      threadId: thread.id,
      toolCallId: body.toolCallId,
    })

    if (!questionRequest) {
      throw createError("BadRequestError", { message: "No pending question request found" })
    }

    await answerAgentCopilotQuestionRequest({
      requestId: questionRequest.id,
      answers: body.answers,
    })

    const allResources = await listResources()
    const resources: ResourceInfo[] = allResources
      .filter((r): r is typeof r & { type: UserConfigurableResourceType } =>
        UserConfigurableResourceType.includes(r.type as UserConfigurableResourceType),
      )
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        type: r.type,
        description: r.description,
      }))

    const answersResult: AskQuestionsResult = { answers: body.answers }
    const content = formatQuestionResponse(answersResult)
    const userMessage = await createAgentCopilotMessage({
      threadId: thread.id,
      role: "user",
      content,
      toolCalls: [{ id: body.toolCallId, name: "ask_questions", args: {}, result: answersResult }],
    })

    let currentSeq = thread.seq + 1
    await emitCopilotEvent({
      threadId: thread.id,
      seq: currentSeq,
      type: "copilot.questions.submitted",
      data: { toolCallId: body.toolCallId, answers: body.answers },
    })

    currentSeq++
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
    runCopilotLLMWithToolResult({
      organizationId,
      threadId: thread.id,
      agentId,
      toolCallId: body.toolCallId,
      toolResult: answersResult,
      currentConfig,
      pendingProposalConfig,
      resources,
      environmentId: body.environmentId ?? null,
      initialSeq: currentSeq,
      modelId: body.model,
      template,
    }).catch((err) => console.error("Copilot LLM error:", err))

    return c.json({ success: true, message: userMessage }, 202)
  },
)

function formatQuestionResponse(result: AskQuestionsResult): string {
  if (result.answers.length === 0) return "[No answers provided]"

  return result.answers
    .map((answer) => {
      const selections = answer.selected.join(", ")
      const other = answer.otherText ? ` (Other: ${answer.otherText})` : ""
      return `[Question ${answer.questionIndex + 1}]: ${selections}${other}`
    })
    .join("\n")
}
