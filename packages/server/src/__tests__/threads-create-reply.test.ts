import { test, expect, vi, beforeEach } from "vitest"
import { z } from "zod"

const messageCalls: Array<Record<string, unknown>> = []
const workflowCalls: Array<{ options: { args?: Array<Record<string, unknown>> } }> = []
const emitCalls: Array<Record<string, unknown>> = []

let startCalls: Array<Record<string, unknown>> = []

vi.mock("@synatra/core", () => ({
  principal: {
    orgId: () => "org-1",
    userId: () => "user-1",
  },
  getAgentById: async (id: string) => ({
    id,
    organizationId: "org-1",
    currentReleaseId: "rel-1",
    configHash: "hash-1",
  }),
  getChannelById: async (id: string) => ({ id, organizationId: "org-1" }),
  isAssignedChannelAgent: async () => true,
  canAccessCurrentUserChannelMember: async () => true,
  pendingHumanRequestByThread: async () => null,
  getEnvironmentById: async (id: string) => ({ id, organizationId: "org-1" }),
  getPromptById: async (id: string) => ({
    id,
    organizationId: "org-1",
    agentId: "agent-1",
    currentReleaseId: "prompt-rel-1",
    mode: "template",
    content: "Hello {{name}}",
    script: null,
  }),
  StartThreadSchema: z.object({}).passthrough(),
  ReplyThreadSchema: z.object({ threadId: z.string().optional(), message: z.string().optional() }).passthrough(),
  startThread: async (input: Record<string, unknown>) => {
    startCalls.push(input)
    const hasPrompt = !!input.promptId
    return {
      thread: { id: "thread-1", workflowId: "wf-thread-1", seq: 0 },
      message: hasPrompt ? undefined : { id: "msg-1" },
      messageSeq: hasPrompt ? 0 : 1,
      messageUpdatedAt: new Date("2024-01-01T00:00:00Z"),
      workflowInput: {
        threadId: "thread-1",
        agentId: input.agentId ?? "agent-1",
        agentReleaseId: "rel-1",
        agentVersionMode: "fixed",
        organizationId: "org-1",
        environmentId: input.environmentId ?? "env-1",
        channelId: input.channelId ?? "channel-1",
        subject: input.subject ?? "Subject",
        message: input.message,
        initialMessageSaved: !hasPrompt,
        messageId: hasPrompt ? undefined : "msg-1",
        createdBy: "user-1",
        promptRef: hasPrompt
          ? {
              promptId: input.promptId,
              promptReleaseId: "prompt-rel-1",
              mode: "template",
              template: "Hello {{name}}",
            }
          : undefined,
        promptInput: input.promptInput,
      },
    }
  },
  replyThread: async (input: { threadId: string; message: string }) => {
    messageCalls.push({ threadId: input.threadId, type: "user", content: input.message })
    return {
      thread: {
        id: input.threadId,
        workflowId: "wf-thread-1",
        status: "running",
        seq: 2,
      },
      message: { id: "msg-1", threadId: input.threadId, type: "user", content: input.message },
      messageSeq: 1,
      messageUpdatedAt: new Date("2024-01-01T00:00:00Z"),
      statusSeq: 2,
      statusUpdatedAt: new Date("2024-01-01T00:00:01Z"),
      action: "start" as const,
      workflowInput: {
        threadId: input.threadId,
        agentId: "agent-1",
        agentReleaseId: "rel-1",
        agentVersionMode: "fixed",
        organizationId: "org-1",
        environmentId: "env-1",
        channelId: "channel-1",
        subject: "sub",
        message: input.message,
        initialMessageSaved: true,
        messageId: "msg-1",
        createdBy: "user-1",
      },
    }
  },
  createMessage: async (input: Record<string, unknown>) => {
    messageCalls.push(input)
    return { id: "msg-1", ...input }
  },
  updateMessageToolResultStatus: async () => null,
  NotFoundError: class NotFoundError extends Error {},
  BadRequestError: class BadRequestError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
  ConflictError: class ConflictError extends Error {},
  InternalError: class InternalError extends Error {},
}))

vi.mock("@synatra/workflows", () => ({
  threadWorkflow: async () => null,
  userMessageSignal: {},
}))

vi.mock("../temporal", () => ({
  getTemporalClient: async () => ({
    workflow: {
      start: async (_workflow: unknown, options: { args?: Array<Record<string, unknown>> }) => {
        workflowCalls.push({ options })
      },
    },
  }),
}))

vi.mock("../config", () => ({
  config: () => ({
    temporal: { taskQueue: "test-queue" },
  }),
}))

vi.mock("../routes/threads/stream", () => ({
  emitThreadEvent: async (input: Record<string, unknown>) => {
    emitCalls.push(input)
  },
  emitThreadStatusChanged: async () => null,
}))

const { create } = await import("../routes/threads/create")
const { reply } = await import("../routes/threads/reply")

beforeEach(() => {
  messageCalls.length = 0
  workflowCalls.length = 0
  emitCalls.length = 0
  startCalls.length = 0
})

test("threads.create persists initial message and passes initialMessageSaved", async () => {
  const res = await create.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-1",
      channelId: "channel-1",
      environmentId: "env-1",
      subject: "Subject",
      message: "Hello",
    }),
  })

  expect(res.status).toBe(202)
  expect(emitCalls.length).toBe(1)
  expect(workflowCalls.length).toBe(1)
  const args = workflowCalls[0].options.args?.[0] ?? {}
  expect(args.initialMessageSaved).toBe(true)
  expect(args.messageId).toBe("msg-1")
})

test("threads.reply persists user message and passes initialMessageSaved", async () => {
  const res = await reply.request("/thread-1/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Follow up" }),
  })

  expect(res.status).toBe(202)
  expect(messageCalls.length).toBe(1)
  expect(messageCalls[0].type).toBe("user")
  expect(messageCalls[0].content).toBe("Follow up")
  expect(emitCalls.length).toBe(1)
  expect(workflowCalls.length).toBe(1)
  const args = workflowCalls[0].options.args?.[0] ?? {}
  expect(args.initialMessageSaved).toBe(true)
  expect(args.messageId).toBe("msg-1")
})

test("threads.create with promptId passes promptRef and promptInput to workflow", async () => {
  const res = await create.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-1",
      channelId: "channel-1",
      environmentId: "env-1",
      subject: "Prompt Test",
      promptId: "prompt-1",
      promptInput: { name: "Alice" },
    }),
  })

  expect(res.status).toBe(202)
  expect(startCalls.length).toBe(1)
  expect(startCalls[0].promptId).toBe("prompt-1")
  expect(startCalls[0].promptInput).toEqual({ name: "Alice" })
  expect(startCalls[0].message).toBeUndefined()
  expect(workflowCalls.length).toBe(1)
  const args = workflowCalls[0].options.args?.[0] ?? {}
  expect(args.promptRef).toBeDefined()
  const promptRef = args.promptRef as { promptId: string }
  expect(promptRef.promptId).toBe("prompt-1")
  expect(args.promptInput).toEqual({ name: "Alice" })
  expect(args.initialMessageSaved).toBe(false)
})
