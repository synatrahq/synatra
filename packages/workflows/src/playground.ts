import { proxyActivities, defineSignal, defineQuery, setHandler, upsertSearchAttributes } from "@temporalio/workflow"
import type { ThreadStatus, ThreadKind, AgentRuntimeConfig, ToolCallRecord } from "@synatra/core/types"
import type { Activities } from "./activities"
import {
  executeAgentLoop,
  type AgentLoopSignals,
  type HumanResponseSignalPayload,
  type UserMessageSignalPayload,
  type ConversationMessage,
} from "./agent-loop"

export interface PlaygroundWorkflowInput {
  sessionId: string
  agentId: string
  organizationId: string
  environmentId: string
  runtimeConfig: AgentRuntimeConfig
  message?: string
  userId?: string
}

export interface PlaygroundWorkflowResult {
  status: ThreadStatus
  result?: unknown
  error?: string
}

export interface PlaygroundState {
  status: ThreadStatus
  currentRunId: string | null
  pendingHumanRequestId: string | null
  pendingAction: ToolCallRecord | null
}

export const playgroundCancelSignal = defineSignal("playground_cancel")
export const getPlaygroundStateQuery = defineQuery<PlaygroundState>("getPlaygroundState")
export const playgroundHumanResponseSignal = defineSignal<[HumanResponseSignalPayload]>("playgroundHumanResponse")
export const playgroundUserMessageSignal = defineSignal<[UserMessageSignalPayload]>("playgroundUserMessage")

const {
  resolveLlmConfig,
  callLLM,
  evaluateToolRules,
  executeFunction,
  validateToolParams,
  updateThread,
  addMessage,
  loadThreadMessages,
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
  loadAgentConfig,
} = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
})

export async function playgroundWorkflow(input: PlaygroundWorkflowInput): Promise<PlaygroundWorkflowResult> {
  const { sessionId: threadId, agentId, organizationId, environmentId, runtimeConfig, message } = input

  const kind: ThreadKind = "playground"

  upsertSearchAttributes({
    OrganizationId: [organizationId],
    AgentId: [agentId],
    EnvironmentId: [environmentId],
    PlaygroundStatus: ["running"],
  })

  let state: PlaygroundState = {
    status: "running",
    currentRunId: null,
    pendingHumanRequestId: null,
    pendingAction: null,
  }

  let cancelled = false
  let humanResponseReceived = false
  let humanResponsePayload: HumanResponseSignalPayload | undefined
  let userMessageReceived = false
  let userMessagePayload: UserMessageSignalPayload | undefined

  setHandler(getPlaygroundStateQuery, () => state)
  setHandler(playgroundCancelSignal, () => {
    cancelled = true
    state.status = "cancelled"
  })

  setHandler(playgroundHumanResponseSignal, (p) => {
    if (state.pendingHumanRequestId === p.requestId) {
      humanResponseReceived = true
      humanResponsePayload = p
    }
  })

  setHandler(playgroundUserMessageSignal, (p) => {
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
      state.status = status
    },
    setPendingAction: (action) => {
      state.pendingAction = action
    },
    setPendingHumanRequestId: (requestId) => {
      state.pendingHumanRequestId = requestId
    },
  }

  try {
    const existingMessages = await loadThreadMessages({ threadId })
    let messages: ConversationMessage[] =
      existingMessages.messages.length > 0 ? (existingMessages.messages as ConversationMessage[]) : []

    if (message) {
      const last = messages[messages.length - 1]
      if (!(last && last.role === "user" && last.content === message)) {
        messages.push({ role: "user", content: message })
        await addMessage({ organizationId, threadId, type: "user", content: message })
      }
    }

    const loaded = await loadAgentConfig({
      agentId,
      organizationId,
      agentVersionMode: "current",
      runtimeConfigOverride: runtimeConfig,
    })

    const loopResult = await executeAgentLoop(
      {
        id: threadId,
        kind,
        agentConfig: runtimeConfig,
        organizationId,
        environmentId,
        agentId,
        resolvedSubagents: loaded.resolvedSubagents,
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
        onRunCreated: (runId) => {
          state.currentRunId = runId
        },
      },
    )

    state.status = loopResult.state.status
    state.currentRunId = loopResult.state.currentRunId
    state.pendingHumanRequestId = loopResult.state.pendingHumanRequestId
    state.pendingAction = loopResult.state.pendingAction
    return loopResult.result
  } catch (error) {
    state.status = "failed"
    upsertSearchAttributes({ PlaygroundStatus: ["failed"] })
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (state.currentRunId) {
      await failRun({ organizationId, id: state.currentRunId, error: errorMessage })
    }
    await updateThread({ organizationId, threadId, status: "failed", error: errorMessage })
    return { status: "failed", error: errorMessage }
  }
}
