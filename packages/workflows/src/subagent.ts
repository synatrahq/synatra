import { proxyActivities, defineSignal, defineQuery, setHandler } from "@temporalio/workflow"
import type { RunStatus, AgentRuntimeConfig, ToolCallRecord } from "@synatra/core/types"
import type { Activities } from "./activities"
import {
  executeAgentLoop,
  type AgentLoopSignals,
  type HumanResponseSignalPayload,
  type UserMessageSignalPayload,
  type ConversationMessage,
} from "./agent-loop"

export interface SubagentDependency {
  agentAlias: string
  task: string
  result: unknown
}

export interface SiblingAgent {
  alias: string
  description: string
}

export interface SubagentWorkflowInput {
  threadId: string
  parentRunId: string
  runId: string
  organizationId: string
  environmentId: string
  agentId: string
  agentReleaseId: string
  agentConfig: AgentRuntimeConfig
  task: string
  dependencies?: SubagentDependency[]
  siblings?: SiblingAgent[]
}

export interface SubagentWorkflowResult {
  status: "completed" | "failed" | "cancelled" | "rejected"
  result?: unknown
  error?: string
  rejectReason?: string
}

export interface SubagentState {
  status: RunStatus
  pendingHumanRequestId: string | null
  pendingAction: ToolCallRecord | null
}

export const cancelSignal = defineSignal("cancel")
export const getStateQuery = defineQuery<SubagentState>("getState")
export const humanResponseSignal = defineSignal<[HumanResponseSignalPayload]>("humanResponse")
export const userMessageSignal = defineSignal<[UserMessageSignalPayload]>("userMessage")

const {
  resolveLlmConfig,
  callLLM,
  evaluateToolRules,
  executeFunction,
  updateThread,
  addMessage,
  validateToolParams,
  createOutputItem,
  createHumanRequest,
  createApprovalHumanRequest,
  resolveHumanRequest,
  updateHumanRequestStatus,
  createRun,
  updateRun,
  completeRun,
  failRun,
  cancelRun,
  rejectRun,
  loadAgentConfig,
} = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
})

function formatDependencies(dependencies: SubagentDependency[]): string {
  const lines = ["## Previous Results from Related Subagents", ""]
  for (const dep of dependencies) {
    lines.push(`### ${dep.agentAlias}`)
    lines.push(`**Task:** ${dep.task}`)
    lines.push(`**Result:**`)
    lines.push("```json")
    lines.push(JSON.stringify(dep.result, null, 2))
    lines.push("```")
    lines.push("")
  }
  return lines.join("\n")
}

function formatSiblings(siblings: SiblingAgent[]): string {
  const lines = [
    "## Other Available Agents (via parent)",
    "",
    "If your task requires capabilities outside your scope, call `return_to_parent` with a suggestion to delegate to an appropriate agent:",
    "",
  ]
  for (const s of siblings) {
    lines.push(`- **${s.alias}**: ${s.description}`)
  }
  return lines.join("\n")
}

export async function subagentWorkflow(input: SubagentWorkflowInput): Promise<SubagentWorkflowResult> {
  const {
    threadId,
    parentRunId,
    runId,
    organizationId,
    environmentId,
    agentId,
    agentReleaseId,
    agentConfig,
    task,
    dependencies,
    siblings,
  } = input

  let state: SubagentState = {
    status: "running",
    pendingHumanRequestId: null,
    pendingAction: null,
  }

  let cancelled = false
  let humanResponseReceived = false
  let humanResponsePayload: HumanResponseSignalPayload | undefined
  let userMessageReceived = false
  let userMessagePayload: UserMessageSignalPayload | undefined

  setHandler(getStateQuery, () => state)
  setHandler(cancelSignal, () => {
    cancelled = true
    state.status = "cancelled"
  })
  setHandler(humanResponseSignal, (p) => {
    if (state.pendingHumanRequestId === p.requestId) {
      humanResponseReceived = true
      humanResponsePayload = p
    }
  })
  setHandler(userMessageSignal, (p) => {
    if (state.pendingHumanRequestId) {
      userMessageReceived = true
      userMessagePayload = p
    }
  })

  const signals: AgentLoopSignals = {
    isCancelled: () => cancelled,
    isHumanResponseReceived: () => humanResponseReceived,
    getHumanResponsePayload: () => humanResponsePayload,
    isUserMessageReceived: () => userMessageReceived,
    getUserMessagePayload: () => userMessagePayload,
    resetHumanResponse: () => {
      humanResponseReceived = false
      humanResponsePayload = undefined
    },
    resetUserMessage: () => {
      userMessageReceived = false
      userMessagePayload = undefined
    },
    setStatus: (status) => {
      state.status = status as RunStatus
    },
    setPendingAction: (action) => {
      state.pendingAction = action
    },
    setPendingHumanRequestId: (requestId) => {
      state.pendingHumanRequestId = requestId
    },
  }

  try {
    const sections: string[] = []
    if (dependencies && dependencies.length > 0) {
      sections.push(formatDependencies(dependencies))
    }
    if (siblings && siblings.length > 0) {
      sections.push(formatSiblings(siblings))
    }
    const userContent = sections.length > 0 ? `${sections.join("\n\n")}\n\n## Your Task\n\n${task}` : task
    const messages: ConversationMessage[] = [{ role: "user", content: userContent }]

    const loopResult = await executeAgentLoop(
      {
        id: threadId,
        kind: "thread",
        agentConfig,
        organizationId,
        environmentId,
        agentId,
        agentReleaseId,
        depth: 1,
        parentRunId,
        existingRunId: runId,
        disableThreadUpdates: true,
      },
      {
        updateThread,
        addMessage,
        createRun,
        updateRun,
        completeRun,
        failRun,
        cancelRun,
        rejectRun,
        createHumanRequest,
        createApprovalHumanRequest,
        resolveHumanRequest,
        updateHumanRequestStatus,
        createOutputItem,
      },
      {
        resolveLlmConfig,
        callLLM,
        evaluateToolRules,
        executeFunction,
        validateToolParams,
        loadAgentConfig,
      },
      signals,
      {
        messages,
        payload: { task },
      },
    )

    if (loopResult.result.status === "completed") {
      return { status: "completed", result: loopResult.result.result }
    }
    if (loopResult.result.status === "cancelled") {
      return { status: "cancelled" }
    }
    if (loopResult.result.status === "rejected") {
      return { status: "rejected", rejectReason: loopResult.result.error }
    }
    return { status: "failed", error: loopResult.result.error }
  } catch (error) {
    state.status = "failed"
    const errorMessage = error instanceof Error ? error.message : String(error)
    await failRun({ organizationId, id: runId, error: errorMessage })
    return { status: "failed", error: errorMessage }
  }
}
