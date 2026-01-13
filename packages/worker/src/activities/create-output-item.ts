import { principal, createOutputItemAndIncrementSeq } from "@synatra/core"
import type { OutputKind } from "@synatra/core/types"
import { streamingEnabled, emitThreadEvent } from "./thread-streaming"

export interface CreateOutputItemInput {
  organizationId: string
  threadId: string
  runId?: string
  toolCallId?: string
  kind: OutputKind
  name?: string
  payload: Record<string, unknown>
}

export async function createOutputItem(input: CreateOutputItemInput): Promise<{ outputItemId: string }> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const { item, seq } = await createOutputItemAndIncrementSeq({
      threadId: input.threadId,
      runId: input.runId,
      toolCallId: input.toolCallId,
      kind: input.kind,
      name: input.name,
      payload: input.payload,
    })

    if (streamingEnabled) {
      await emitThreadEvent({
        threadId: input.threadId,
        type: "output_item.created",
        seq,
        data: { outputItem: item },
      })
    }

    return { outputItemId: item.id }
  })
}
