import {
  principal,
  incrementThreadSeq,
  createHumanRequestAndIncrementSeq,
  findHumanRequestById,
  findHumanResponseByRequestId,
  createHumanResponse,
  updateHumanRequestStatus as updateHumanRequestStatusCore,
} from "@synatra/core"
import type {
  HumanRequestKind,
  HumanRequestConfig,
  HumanResponseStatus,
  HumanRequestFieldConfig,
  ApprovalAuthority,
} from "@synatra/core/types"
import { streamingEnabled, emitThreadEvent } from "./thread-streaming"

export interface CreateHumanRequestInput {
  organizationId: string
  threadId: string
  runId?: string
  toolCallId: string
  params: Record<string, unknown>
  timeoutMs: number
}

export interface CreateApprovalHumanRequestInput {
  organizationId: string
  threadId: string
  runId?: string
  toolCallId: string
  action: {
    name: string
    params: Record<string, unknown>
    rationale?: string
  }
  authority: ApprovalAuthority
  timeoutMs: number
  variant?: "info" | "warning" | "danger"
  allowModification?: boolean
}

function buildFieldConfig(field: Record<string, unknown>): HumanRequestFieldConfig {
  const kind = field.kind as string
  const key = field.key as string

  switch (kind) {
    case "form":
      return {
        kind: "form",
        key,
        schema: (field.schema as Record<string, unknown>) || {},
        defaults: field.defaults as Record<string, unknown>,
      }
    case "question":
      return {
        kind: "question",
        key,
        questions:
          (field.questions as Array<{
            question: string
            header: string
            options: Array<{ label: string; description: string }>
            multiSelect?: boolean
          }>) || [],
      }
    case "select_rows":
      return {
        kind: "select_rows",
        key,
        columns: (field.columns as Array<{ key: string; label: string }>) || [],
        data: (field.data as Array<Record<string, unknown>>) || [],
        selectionMode: (field.selectionMode as "single" | "multiple") || "multiple",
        allowNone: field.allowNone !== false,
      }
    case "confirm":
      return {
        kind: "confirm",
        key,
        confirmLabel: field.confirmLabel as string,
        rejectLabel: field.rejectLabel as string,
        variant: field.variant as "info" | "warning" | "danger",
      }
    default:
      return { kind: "form", key, schema: {} }
  }
}

function buildConfig(params: Record<string, unknown>): { kind: HumanRequestKind; config: HumanRequestConfig } {
  const fields = (params.fields as Array<Record<string, unknown>>) || []
  const fieldConfigs = fields.map(buildFieldConfig)
  const kind: HumanRequestKind = fieldConfigs[0]?.kind || "form"

  return {
    kind,
    config: {
      fields: fieldConfigs,
    },
  }
}

export async function createHumanRequest(
  input: CreateHumanRequestInput,
): Promise<{ requestId: string; timeoutMs: number }> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const { kind, config } = buildConfig(input.params)
    const title = (input.params.title as string) || "Input Required"
    const description = input.params.description as string | undefined

    const { request, seq } = await createHumanRequestAndIncrementSeq({
      threadId: input.threadId,
      runId: input.runId,
      toolCallId: input.toolCallId,
      kind,
      title,
      description,
      config,
      timeoutMs: input.timeoutMs,
    })

    if (streamingEnabled) {
      await emitThreadEvent({
        threadId: input.threadId,
        type: "human_request.created",
        seq,
        data: { humanRequest: request },
      })
    }

    return { requestId: request.id, timeoutMs: input.timeoutMs }
  })
}

export interface ResolveHumanRequestInput {
  organizationId: string
  requestId: string
  status: HumanResponseStatus
  respondedBy?: string
  data?: unknown
}

export async function resolveHumanRequest(input: ResolveHumanRequestInput): Promise<{ responseId: string } | null> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const humanRequest = await findHumanRequestById(input.requestId)
    if (!humanRequest) return null

    const existing = await findHumanResponseByRequestId(input.requestId)
    if (existing) {
      return { responseId: existing.id }
    }

    const response = await createHumanResponse({
      requestId: input.requestId,
      status: input.status,
      respondedBy: input.respondedBy,
      data: input.data,
    })

    const updatedRequest = await findHumanRequestById(input.requestId)

    if (streamingEnabled && updatedRequest) {
      const seqResult = await incrementThreadSeq({ id: humanRequest.threadId })
      if (seqResult) {
        await emitThreadEvent({
          threadId: humanRequest.threadId,
          type: "human_request.resolved",
          seq: seqResult.seq,
          data: { humanRequest: updatedRequest, response },
        })
      }
    }

    return { responseId: response.id }
  })
}

export interface UpdateHumanRequestStatusInput {
  organizationId: string
  requestId: string
  status: "pending" | "responded" | "timeout" | "cancelled" | "skipped"
}

export async function updateHumanRequestStatus(input: UpdateHumanRequestStatusInput): Promise<void> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    await updateHumanRequestStatusCore({ id: input.requestId, status: input.status })
  })
}

export async function createApprovalHumanRequest(
  input: CreateApprovalHumanRequestInput,
): Promise<{ requestId: string }> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const title = `Approve: ${input.action.name}`
    const description = input.action.rationale ?? "Requires human approval"

    const config: HumanRequestConfig = {
      fields: [
        {
          kind: "approval",
          key: "action",
          action: {
            name: input.action.name,
            params: input.action.params,
            rationale: input.action.rationale,
          },
          variant: input.variant ?? "warning",
          allowModification: input.allowModification ?? true,
        } as HumanRequestFieldConfig,
      ],
    }

    const { request, seq } = await createHumanRequestAndIncrementSeq({
      threadId: input.threadId,
      runId: input.runId,
      toolCallId: input.toolCallId,
      kind: "approval",
      title,
      description,
      config,
      authority: input.authority,
      timeoutMs: input.timeoutMs,
    })

    if (streamingEnabled) {
      await emitThreadEvent({
        threadId: input.threadId,
        type: "human_request.created",
        seq,
        data: { humanRequest: request },
      })
    }

    return { requestId: request.id }
  })
}
