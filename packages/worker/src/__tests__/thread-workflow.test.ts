import { test, expect, vi, beforeEach, afterEach } from "vitest"

let agentConfig: {
  model: { provider: "openai"; model: string; temperature: number; topP?: number }
  systemPrompt: string
  tools: Array<{
    name: string
    description: string
    params: Record<string, unknown>
    returns: Record<string, unknown>
    code: string
  }>
  maxIterations?: number
  maxToolCallsPerIteration?: number
  maxActiveTimeMs?: number
}
let callLLMQueue: Array<{
  type: "text" | "tool_calls"
  content?: string
  toolCalls?: Array<{ id: string; name: string; params: Record<string, unknown> }>
  rawResponse: unknown
  durationMs: number
  usage?: { inputTokens: number; outputTokens: number }
}>
let callLLMInputs: Array<{
  timeoutMs?: number
  messages: Array<{ role: "user" | "assistant" | "tool"; content?: string; messageId?: string }>
}>
let executeFunctionQueue: Array<{ ok: boolean; result?: unknown; error?: string; durationMs: number }>
let events: Array<{ type: "addMessage" | "updateThread"; data: Record<string, unknown> }>
let validateToolParamsQueue: Array<{ valid: true } | { valid: false; errors: string[] }>
let loadThreadMessagesQueue: Array<{
  messages: Array<{ role: "user" | "assistant" | "tool"; content: string; messageId?: string }>
}>
let executeScriptQueue: Array<{
  ok: boolean
  result?: { action: "run"; prompt: string } | { action: "skip"; reason?: string }
  error?: string
  durationMs: number
}>
let applyPromptInputs: Array<{ prompt: string; payload: Record<string, unknown> }>
let completeRunInputs: Array<{ inputTokens?: number; outputTokens?: number }>
let failRunInputs: Array<{ error: string; inputTokens?: number; outputTokens?: number }>

const activities = {
  loadAgentConfig: async (input: {
    agentId: string
    agentReleaseId?: string
    agentVersionMode: "current" | "fixed"
    triggerId?: string
    organizationId: string
  }) => ({
    agentId: input.agentId,
    agentReleaseId: input.agentReleaseId ?? "release-1",
    agentConfig,
    agentConfigHash: "hash",
    promptConfig: null,
  }),
  ensureThread: async (input: { threadId?: string }) => ({ threadId: input.threadId ?? "thread-1" }),
  createRun: async () => ({ runId: "run-1", run: { id: "run-1" } }),
  updateRun: async () => {},
  completeRun: async (input: { inputTokens?: number; outputTokens?: number }) => {
    completeRunInputs.push({ inputTokens: input.inputTokens, outputTokens: input.outputTokens })
  },
  failRun: async (input: { error: string; inputTokens?: number; outputTokens?: number }) => {
    failRunInputs.push({ error: input.error, inputTokens: input.inputTokens, outputTokens: input.outputTokens })
  },
  loadThreadMessages: async () => loadThreadMessagesQueue.shift() ?? { messages: [] },
  applyPrompt: async (input: { prompt: string; payload: Record<string, unknown> }) => {
    applyPromptInputs.push(input)
    return { messages: [{ role: "user" as const, content: input.prompt }] }
  },
  executeScript: async () => {
    const next = executeScriptQueue.shift()
    if (!next) throw new Error("Missing executeScript response")
    return next
  },
  callLLM: async (input: {
    timeoutMs?: number
    messages: Array<{ role: "user" | "assistant" | "tool"; content?: string; messageId?: string }>
  }) => {
    const copy = input.messages.map((m) => ({ ...m }))
    callLLMInputs.push({ timeoutMs: input.timeoutMs, messages: copy })
    const next = callLLMQueue.shift()
    if (!next) throw new Error("Missing callLLM response")
    return next
  },
  evaluateToolRules: async () => ({
    requiresReview: false,
    approvalAuthority: "any_member",
    selfApproval: true,
    approvalTimeoutMs: 60000,
  }),
  executeFunction: async () => {
    const next = executeFunctionQueue.shift()
    if (!next) throw new Error("Missing executeFunction response")
    return next
  },
  updateThread: async (input: Record<string, unknown>) => {
    events.push({ type: "updateThread", data: input })
  },
  addMessage: async (input: Record<string, unknown>) => {
    events.push({ type: "addMessage", data: input })
    return { messageId: `msg-${events.length}` }
  },
  createOutputItem: async () => ({ outputItemId: "output-1" }),
  createHumanRequest: async () => ({ requestId: "hr-1", timeoutMs: 1000 }),
  createApprovalHumanRequest: async () => ({ requestId: "hr-1" }),
  resolveHumanRequest: async () => ({ responseId: "response-1" }),
  updateHumanRequestStatus: async () => {},
  validateToolParams: async () => validateToolParamsQueue.shift() ?? { valid: true },
  resolveLlmConfig: async () => ({ config: { apiKey: "test-api-key", baseUrl: null } }),
}

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => activities,
  defineSignal: (name: string) => name,
  defineQuery: (name: string) => name,
  setHandler: () => {},
  condition: async () => true,
  upsertSearchAttributes: () => {},
  workflowInfo: () => ({ workflowId: "workflow-1" }),
  executeChild: async () => ({}),
}))

const { threadWorkflow } = await import("@synatra/workflows")

let originalNow: typeof Date.now

function resetState() {
  callLLMQueue = []
  callLLMInputs = []
  executeFunctionQueue = []
  events = []
  validateToolParamsQueue = []
  loadThreadMessagesQueue = []
  executeScriptQueue = []
  applyPromptInputs = []
  completeRunInputs = []
  failRunInputs = []
  agentConfig = {
    model: { provider: "openai", model: "gpt-4o-mini", temperature: 0 },
    systemPrompt: "",
    tools: [
      {
        name: "tool-a",
        description: "test",
        params: {},
        returns: {},
        code: "",
      },
      {
        name: "tool-b",
        description: "test",
        params: {},
        returns: {},
        code: "",
      },
    ],
    maxIterations: 2,
    maxToolCallsPerIteration: 10,
    maxActiveTimeMs: 30000,
  }
}

beforeEach(() => {
  originalNow = Date.now
})

afterEach(() => {
  Date.now = originalNow
})

test("persists tool results before failing on active time limit", async () => {
  resetState()

  const times = [0, 30000]
  Date.now = () => times.shift() ?? 30000

  callLLMQueue.push({
    type: "tool_calls",
    toolCalls: [{ id: "call-1", name: "tool-a", params: {} }],
    rawResponse: {},
    durationMs: 1000,
  })
  executeFunctionQueue.push({ ok: true, result: { ok: true }, durationMs: 0 })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hi",
  })

  const toolResultIndex = events.findIndex((event) => {
    if (event.type !== "addMessage") return false
    return event.data.type === "tool_result"
  })
  const failedIndex = events.findIndex((event) => {
    if (event.type !== "updateThread") return false
    return event.data.status === "failed" && event.data.error === "Active time limit exceeded"
  })

  expect(res.status).toBe("failed")
  expect(toolResultIndex).toBeGreaterThanOrEqual(0)
  expect(failedIndex).toBeGreaterThanOrEqual(0)
  expect(toolResultIndex).toBeLessThan(failedIndex)
})

test("uses wall-clock time for parallel tool execution", async () => {
  resetState()

  const times = [0, 40000]
  Date.now = () => times.shift() ?? 40000

  callLLMQueue.push({
    type: "tool_calls",
    toolCalls: [
      { id: "call-1", name: "tool-a", params: {} },
      { id: "call-2", name: "tool-b", params: {} },
    ],
    rawResponse: {},
    durationMs: 0,
  })
  executeFunctionQueue.push({ ok: true, result: { ok: true }, durationMs: 20000 })
  executeFunctionQueue.push({ ok: true, result: { ok: true }, durationMs: 20000 })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hi",
  })

  expect(res.status).toBe("failed")
  const failedIndex = events.findIndex((event) => {
    if (event.type !== "updateThread") return false
    return event.data.status === "failed" && event.data.error === "Active time limit exceeded"
  })
  expect(failedIndex).toBeGreaterThanOrEqual(0)
})

test("continues when 1ms remains", async () => {
  resetState()

  const times = [0, 28999]
  Date.now = () => times.shift() ?? 28999

  callLLMQueue.push({
    type: "tool_calls",
    toolCalls: [{ id: "call-1", name: "tool-a", params: {} }],
    rawResponse: {},
    durationMs: 1000,
  })
  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 0,
  })
  executeFunctionQueue.push({ ok: true, result: { ok: true }, durationMs: 0 })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hi",
  })

  expect(callLLMInputs.length).toBe(2)
  expect(res.status).toBe("completed")
})

test("retries when output_markdown params are invalid", async () => {
  resetState()

  validateToolParamsQueue.push({ valid: false, errors: ["root: must have required property 'content'"] })
  callLLMQueue.push({
    type: "tool_calls",
    toolCalls: [
      {
        id: "call-1",
        name: "output_markdown",
        params: {},
      },
    ],
    rawResponse: {},
    durationMs: 0,
  })
  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 0,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hi",
  })

  expect(callLLMInputs.length).toBe(2)
  expect(res.status).toBe("completed")
  expect(
    events.some(
      (event) =>
        event.type === "addMessage" &&
        event.data.type === "tool_result" &&
        String((event.data as { toolResult?: { error?: string } }).toolResult?.error ?? "").includes(
          "System tool parameters failed validation",
        ),
    ),
  ).toBe(true)
})

test("includes repeated user message when not already saved", async () => {
  resetState()

  loadThreadMessagesQueue.push({
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ],
  })
  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 0,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hello",
  })

  expect(res.status).toBe("completed")
  expect(callLLMInputs.length).toBe(1)
  const last = callLLMInputs[0].messages[callLLMInputs[0].messages.length - 1]
  expect(last.role).toBe("user")
  expect(last.content).toBe("hello")
})

test("includes saved message when messageId is missing from history", async () => {
  resetState()

  loadThreadMessagesQueue.push({
    messages: [
      { role: "user", content: "hello", messageId: "msg-1" },
      { role: "assistant", content: "hi" },
    ],
  })
  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 0,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hello",
    initialMessageSaved: true,
    messageId: "msg-2",
  })

  expect(res.status).toBe("completed")
  expect(callLLMInputs.length).toBe(1)
  const userMessages = callLLMInputs[0].messages.filter((m) => m.role === "user")
  expect(userMessages.length).toBe(2)
  const last = callLLMInputs[0].messages[callLLMInputs[0].messages.length - 1]
  expect(last.role).toBe("user")
  expect(last.content).toBe("hello")
  expect(last.messageId).toBe("msg-2")
})

test("skips appending when saved message is already in history", async () => {
  resetState()

  loadThreadMessagesQueue.push({ messages: [{ role: "user", content: "hello", messageId: "msg-1" }] })
  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 0,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hello",
    initialMessageSaved: true,
    messageId: "msg-1",
  })

  expect(res.status).toBe("completed")
  expect(events.every((event) => event.type !== "addMessage" || event.data.type !== "user")).toBe(true)
  expect(callLLMInputs.length).toBe(1)
  const userMessages = callLLMInputs[0].messages.filter((m) => m.role === "user")
  expect(userMessages.length).toBe(1)
})

test("renders template when promptRef with template mode is provided", async () => {
  resetState()

  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 0,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    promptRef: {
      promptId: "prompt-1",
      promptReleaseId: "release-1",
      mode: "template",
      template: "Hello {{name}}, your order is {{orderId}}",
    },
    promptInput: { name: "Alice", orderId: "12345" },
  })

  expect(res.status).toBe("completed")
  expect(applyPromptInputs.length).toBe(1)
  expect(applyPromptInputs[0].prompt).toBe("Hello {{name}}, your order is {{orderId}}")
  expect(applyPromptInputs[0].payload).toEqual({ name: "Alice", orderId: "12345" })
  expect(callLLMInputs.length).toBe(1)
  const userMessages = callLLMInputs[0].messages.filter((m) => m.role === "user")
  expect(userMessages.length).toBe(1)
})

test("executes script and uses result when promptRef with script mode is provided", async () => {
  resetState()

  executeScriptQueue.push({
    ok: true,
    result: { action: "run", prompt: "Generated prompt from script" },
    durationMs: 100,
  })
  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 0,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    promptRef: {
      promptId: "prompt-1",
      promptReleaseId: "release-1",
      mode: "script",
      script: "return { action: 'run', prompt: 'Generated prompt from script' }",
    },
    promptInput: { data: "test" },
  })

  expect(res.status).toBe("completed")
  expect(applyPromptInputs.length).toBe(1)
  expect(applyPromptInputs[0].prompt).toBe("Generated prompt from script")
  expect(callLLMInputs.length).toBe(1)
})

test("skips execution when script returns skip action", async () => {
  resetState()

  executeScriptQueue.push({
    ok: true,
    result: { action: "skip", reason: "Data not ready" },
    durationMs: 100,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    promptRef: {
      promptId: "prompt-1",
      promptReleaseId: "release-1",
      mode: "script",
      script: "return { action: 'skip', reason: 'Data not ready' }",
    },
    promptInput: {},
  })

  expect(res.status).toBe("skipped")
  expect(callLLMInputs.length).toBe(0)
  expect(events.some((e) => e.type === "updateThread" && e.data.status === "skipped")).toBe(true)
})

test("fails when script execution returns error", async () => {
  resetState()

  executeScriptQueue.push({
    ok: false,
    error: "Script execution failed: TypeError",
    durationMs: 50,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    promptRef: {
      promptId: "prompt-1",
      promptReleaseId: "release-1",
      mode: "script",
      script: "throw new Error('fail')",
    },
    promptInput: {},
  })

  expect(res.status).toBe("failed")
  expect(res.error).toBe("Script execution failed: TypeError")
  expect(callLLMInputs.length).toBe(0)
})

test("fails when promptRef has no template or script", async () => {
  resetState()

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    promptRef: {
      promptId: "prompt-1",
      promptReleaseId: "release-1",
      mode: "template",
    },
    promptInput: {},
  })

  expect(res.status).toBe("failed")
  expect(res.error).toBe("Prompt has no content (template or script is missing)")
})

test("accumulates token usage across LLM calls and passes to completeRun", async () => {
  resetState()

  callLLMQueue.push({
    type: "tool_calls",
    toolCalls: [{ id: "call-1", name: "tool-a", params: {} }],
    rawResponse: {},
    durationMs: 100,
    usage: { inputTokens: 100, outputTokens: 50 },
  })
  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 100,
    usage: { inputTokens: 150, outputTokens: 75 },
  })
  executeFunctionQueue.push({ ok: true, result: { ok: true }, durationMs: 0 })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hi",
  })

  expect(res.status).toBe("completed")
  expect(completeRunInputs.length).toBe(1)
  expect(completeRunInputs[0].inputTokens).toBe(250)
  expect(completeRunInputs[0].outputTokens).toBe(125)
})

test("passes token usage to failRun on failure", async () => {
  resetState()

  const times = [0, 30000]
  Date.now = () => times.shift() ?? 30000

  callLLMQueue.push({
    type: "tool_calls",
    toolCalls: [{ id: "call-1", name: "tool-a", params: {} }],
    rawResponse: {},
    durationMs: 1000,
    usage: { inputTokens: 200, outputTokens: 100 },
  })
  executeFunctionQueue.push({ ok: true, result: { ok: true }, durationMs: 0 })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hi",
  })

  expect(res.status).toBe("failed")
  expect(failRunInputs.length).toBe(1)
  expect(failRunInputs[0].error).toBe("Active time limit exceeded")
  expect(failRunInputs[0].inputTokens).toBe(200)
  expect(failRunInputs[0].outputTokens).toBe(100)
})

test("returns token usage when no usage data is present", async () => {
  resetState()

  callLLMQueue.push({
    type: "text",
    content: "done",
    rawResponse: {},
    durationMs: 100,
  })

  const res = await threadWorkflow({
    threadId: "thread-1",
    agentId: "agent-1",
    agentVersionMode: "current",
    organizationId: "org-1",
    environmentId: "env-1",
    channelId: "chan-1",
    subject: "sub",
    message: "hi",
  })

  expect(res.status).toBe("completed")
  expect(completeRunInputs.length).toBe(1)
  expect(completeRunInputs[0].inputTokens).toBeUndefined()
  expect(completeRunInputs[0].outputTokens).toBeUndefined()
})
