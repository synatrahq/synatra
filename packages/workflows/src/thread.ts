import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  upsertSearchAttributes,
  workflowInfo,
} from "@temporalio/workflow"
import type {
  ThreadStatus,
  ThreadKind,
  AgentRuntimeConfig,
  ToolCallRecord,
  ThreadWorkflowInput,
  PromptConfigOverride,
  VersionMode,
} from "@synatra/core/types"
import type { Activities } from "./activities"
import {
  executeAgentLoop,
  type AgentLoopSignals,
  type HumanResponseSignalPayload,
  type UserMessageSignalPayload,
  type ConversationMessage,
} from "./agent-loop"

export type { ThreadWorkflowInput, PromptConfigOverride, VersionMode }

export interface ThreadWorkflowResult {
  status: ThreadStatus
  result?: unknown
  error?: string
}

export interface ThreadState {
  status: ThreadStatus
  currentRunId: string | null
  pendingHumanRequestId: string | null
  pendingAction: ToolCallRecord | null
}

export const cancelSignal = defineSignal("cancel")
export const getStateQuery = defineQuery<ThreadState>("getState")

export const humanResponseSignal = defineSignal<[HumanResponseSignalPayload]>("humanResponse")
export const userMessageSignal = defineSignal<[UserMessageSignalPayload]>("userMessage")

const {
  loadAgentConfig,
  applyPrompt,
  resolveLlmConfig,
  callLLM,
  evaluateToolRules,
  executeFunction,
  executeScript,
  ensureThread,
  updateThread,
  addMessage,
  loadThreadMessages,
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
} = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
})

export async function threadWorkflow(input: ThreadWorkflowInput): Promise<ThreadWorkflowResult> {
  let { threadId } = input
  const {
    agentId,
    agentReleaseId,
    agentVersionMode,
    triggerId,
    triggerReleaseId,
    isDebug,
    organizationId,
    environmentId,
    channelId,
    subject,
    message,
    payload,
    createdBy,
    promptConfigOverride,
    promptRef,
    promptInput,
  } = input

  const kind: ThreadKind = "thread"

  upsertSearchAttributes({
    OrganizationId: [organizationId],
    AgentId: [agentId],
    EnvironmentId: [environmentId],
    ThreadStatus: ["running"],
    ...(triggerId ? { TriggerId: [triggerId] } : {}),
  })

  let state: ThreadState = {
    status: "running",
    currentRunId: null,
    pendingHumanRequestId: null,
    pendingAction: null,
  }

  let agentConfig: AgentRuntimeConfig | null = null

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
    const loaded = await loadAgentConfig({ agentId, triggerId, organizationId, agentReleaseId, agentVersionMode })
    agentConfig = loaded.agentConfig

    if (promptConfigOverride) {
      if (promptConfigOverride.mode === "template" && promptConfigOverride.template) {
        loaded.promptConfig = { mode: "template", template: promptConfigOverride.template }
      } else if (promptConfigOverride.mode === "script" && promptConfigOverride.script) {
        loaded.promptConfig = {
          mode: "script",
          script: promptConfigOverride.script,
          source: promptConfigOverride.source ?? "trigger",
        }
      }
    }

    if (triggerId && !loaded.promptConfig && !message) {
      state.status = "failed"
      upsertSearchAttributes({ ThreadStatus: ["failed"] })
      const error = "Trigger has no valid prompt configuration (template, script, or prompt is empty)"
      return { status: "failed", error }
    }

    const ensured = await ensureThread({
      threadId,
      organizationId,
      environmentId,
      channelId,
      agentId,
      agentReleaseId: loaded.agentReleaseId,
      triggerId,
      triggerReleaseId,
      isDebug,
      agentConfigHash: loaded.agentConfigHash,
      workflowId: workflowInfo().workflowId,
      subject,
      payload: payload ?? {},
      createdBy,
    })
    threadId = ensured.threadId

    const existingMessages = await loadThreadMessages({ threadId })
    let messages: ConversationMessage[] = existingMessages.messages.length > 0 ? existingMessages.messages : []

    let userContent: string
    let scriptDurationMs = 0
    const saved = input.initialMessageSaved === true
    const savedMessageId = input.messageId

    type PromptConfig = {
      mode: "template" | "script"
      script?: string
      template?: string
      source: "trigger" | "prompt"
      data: Record<string, unknown>
    }
    let promptConfig: PromptConfig | null = null
    if (triggerId && loaded.promptConfig) {
      const pc = loaded.promptConfig
      promptConfig =
        pc.mode === "script"
          ? { mode: "script", script: pc.script, source: pc.source, data: payload ?? {} }
          : { mode: "template", template: pc.template, source: "trigger", data: payload ?? {} }
    } else if (promptRef) {
      promptConfig = {
        mode: promptRef.mode,
        script: promptRef.script,
        template: promptRef.template,
        source: "prompt",
        data: promptInput ?? {},
      }
    }

    if (promptConfig && messages.length === 0) {
      if (promptConfig.mode === "script" && promptConfig.script) {
        const paramAlias = promptConfig.source === "trigger" ? "payload" : "input"
        const scriptResult = await executeScript({
          script: promptConfig.script,
          payload: promptConfig.data,
          paramAlias,
          organizationId,
          environmentId,
        })
        scriptDurationMs = scriptResult.durationMs

        if (!scriptResult.ok) {
          state.status = "failed"
          upsertSearchAttributes({ ThreadStatus: ["failed"] })
          await updateThread({ organizationId, threadId, status: "failed", error: scriptResult.error })
          return { status: "failed", error: scriptResult.error }
        }

        if (scriptResult.result.action === "skip") {
          state.status = "skipped"
          upsertSearchAttributes({ ThreadStatus: ["skipped"] })
          await updateThread({ organizationId, threadId, status: "skipped", skipReason: scriptResult.result.reason })
          return { status: "skipped" }
        }

        const built = await applyPrompt({
          prompt: scriptResult.result.prompt,
          payload: promptConfig.data,
        })
        userContent = built.messages.find((m) => m.role === "user")?.content ?? ""
        messages = built.messages
      } else if (promptConfig.template) {
        const built = await applyPrompt({
          prompt: promptConfig.template,
          payload: promptConfig.data,
        })
        userContent = built.messages.find((m) => m.role === "user")?.content ?? ""
        messages = built.messages
      } else {
        state.status = "failed"
        upsertSearchAttributes({ ThreadStatus: ["failed"] })
        const error = "Prompt has no content (template or script is missing)"
        await updateThread({ organizationId, threadId, status: "failed", error })
        return { status: "failed", error }
      }
    } else if (message) {
      userContent = message
      let append = true
      if (saved) {
        if (savedMessageId) {
          const exists = messages.some((m) => m.role === "user" && m.messageId === savedMessageId)
          if (exists) {
            append = false
          }
        }
        if (append && !savedMessageId) {
          const last = messages[messages.length - 1]
          if (last && last.role === "user" && last.content === userContent) {
            append = false
          }
        }
      }
      if (append) {
        messages.push({ role: "user", content: userContent, messageId: savedMessageId })
      }
    } else {
      userContent = ""
    }

    if (userContent && !saved) {
      await addMessage({ organizationId, threadId, type: "user", content: userContent })
    }

    const loopResult = await executeAgentLoop(
      {
        id: threadId,
        kind,
        agentConfig,
        organizationId,
        environmentId,
        agentId,
        agentReleaseId: loaded.agentReleaseId,
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
        scriptDurationMs,
        payload: payload ?? {},
        onRunCreated: (runId) => {
          state.currentRunId = runId
        },
      },
    )

    state = loopResult.state
    return loopResult.result
  } catch (error) {
    state.status = "failed"
    upsertSearchAttributes({ ThreadStatus: ["failed"] })
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (state.currentRunId) {
      await failRun({ organizationId, id: state.currentRunId, error: errorMessage })
    }
    await updateThread({ organizationId, threadId, status: "failed", error: errorMessage })
    return { status: "failed", error: errorMessage }
  }
}
