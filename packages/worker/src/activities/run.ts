import {
  principal,
  createRun as createRunCore,
  updateRun as updateRunCore,
  findRunById,
  completeRun as completeRunCore,
  failRun as failRunCore,
  getThreadById,
  incrementThreadSeq,
  findAgentById,
} from "@synatra/core"
import type { Run } from "@synatra/core/schema"
import type { RunStatus, UsageRunType } from "@synatra/core/types"
import { streamingEnabled, emitThreadEvent, type ThreadEventType } from "./thread-streaming"

export function getRunType(run: Run, thread: { triggerId: string | null }): UsageRunType {
  if (run.parentRunId) return "subagent"
  if (thread.triggerId) return "trigger"
  return "user"
}

async function withAgent(run: Run) {
  const agent = await findAgentById(run.agentId)
  return {
    ...run,
    agent: agent ? { id: agent.id, name: agent.name, icon: agent.icon, iconColor: agent.iconColor } : null,
  }
}

async function emitRunEvent(threadId: string, type: ThreadEventType, run: Run): Promise<void> {
  if (!streamingEnabled) return
  const seq = await incrementThreadSeq({ id: threadId })
  if (!seq) return
  await emitThreadEvent({ threadId, type, seq: seq.seq, data: { run: await withAgent(run) } })
}

async function recordCompletion(run: Run): Promise<void> {
  const thread = await getThreadById(run.threadId)
  const { recordRunMeter } = await import("./meter")
  await recordRunMeter({ organizationId: thread.organizationId, runId: run.id }).catch((e) =>
    console.error(
      JSON.stringify({
        level: "error",
        message: "Failed to record meter",
        organizationId: thread.organizationId,
        runId: run.id,
        error: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
      }),
    ),
  )
}

export interface CreateRunInput {
  organizationId: string
  threadId: string
  parentRunId?: string
  depth?: number
  agentId: string
  agentReleaseId?: string
  input?: Record<string, unknown>
}

export interface UpdateRunInput {
  organizationId: string
  id: string
  status?: RunStatus
  output?: unknown
  error?: string
  completedAt?: Date
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
}

export interface CompleteRunInput {
  organizationId: string
  id: string
  output?: unknown
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
}

export interface FailRunInput {
  organizationId: string
  id: string
  error: string
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
}

export async function createRun(input: CreateRunInput): Promise<{ runId: string; run: unknown }> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const depth = input.depth ?? 0
    const maxDepth = 1

    if (depth >= maxDepth) {
      throw new Error(`Maximum run depth exceeded (${depth} >= ${maxDepth}). Cannot create subagent at this depth.`)
    }

    const thread = await getThreadById(input.threadId)
    const runType = input.parentRunId ? "subagent" : thread.triggerId ? "trigger" : "user"
    const { checkAndIncrementRunUsageLimiter, decrementRunUsageLimiter } = await import("@synatra/core")
    const limitResult = await checkAndIncrementRunUsageLimiter({
      runType,
      mode: "soft",
    })

    if (!limitResult.allowed) {
      throw new Error(limitResult.error || "Run limit exceeded")
    }

    if (limitResult.overage) {
      console.log(
        JSON.stringify({
          level: "info",
          message: "Overage run created",
          organizationId: input.organizationId,
          current: limitResult.current,
          limit: limitResult.limit,
          overageRate: limitResult.overageRate,
          timestamp: new Date().toISOString(),
        }),
      )
    }

    let run: Run
    try {
      run = await createRunCore({
        threadId: input.threadId,
        parentRunId: input.parentRunId,
        depth,
        agentId: input.agentId,
        agentReleaseId: input.agentReleaseId,
        input: input.input ?? {},
      })
    } catch (err) {
      await decrementRunUsageLimiter({ runType })
      throw err
    }

    await emitRunEvent(input.threadId, "run.created", run)
    return { runId: run.id, run: await withAgent(run) }
  })
}

export async function updateRun(input: UpdateRunInput): Promise<void> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const run = await updateRunCore({
      id: input.id,
      status: input.status,
      output: input.output,
      error: input.error,
      completedAt: input.completedAt,
      durationMs: input.durationMs,
    })
    if (run) await emitRunEvent(run.threadId, "run.updated", run)
  })
}

function calcDuration(run: Run | null, override?: number): number | undefined {
  if (override !== undefined) return override
  const started = run?.startedAt ? new Date(run.startedAt).getTime() : null
  return started ? Math.max(0, Date.now() - started) : undefined
}

export async function completeRun(input: CompleteRunInput): Promise<void> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const existing = await findRunById(input.id)
    const run = await completeRunCore({
      id: input.id,
      output: input.output,
      durationMs: calcDuration(existing, input.durationMs),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    })
    if (!run) return

    await recordCompletion(run)
    await emitRunEvent(run.threadId, "run.completed", run)
  })
}

export async function failRun(input: FailRunInput): Promise<void> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const existing = await findRunById(input.id)
    const run = await failRunCore({
      id: input.id,
      error: input.error,
      durationMs: calcDuration(existing, input.durationMs),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    })
    if (!run) return

    await recordCompletion(run)
    await emitRunEvent(run.threadId, "run.failed", run)
  })
}

export async function cancelRun(input: {
  organizationId: string
  id: string
  reason?: string
  inputTokens?: number
  outputTokens?: number
}): Promise<void> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const existing = await findRunById(input.id)
    const run = await updateRunCore({
      id: input.id,
      status: "cancelled",
      error: input.reason,
      completedAt: new Date(),
      durationMs: calcDuration(existing),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    })
    if (!run) return

    await recordCompletion(run)
    await emitRunEvent(run.threadId, "run.cancelled", run)
  })
}

export async function rejectRun(input: {
  organizationId: string
  id: string
  reason: string
  inputTokens?: number
  outputTokens?: number
}): Promise<void> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const existing = await findRunById(input.id)
    const run = await updateRunCore({
      id: input.id,
      status: "rejected",
      error: input.reason,
      completedAt: new Date(),
      durationMs: calcDuration(existing),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    })
    if (!run) return

    await recordCompletion(run)
    await emitRunEvent(run.threadId, "run.rejected", run)
  })
}
