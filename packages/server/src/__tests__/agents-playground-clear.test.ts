import { test, expect, vi, beforeEach } from "vitest"

const clearCalls: string[] = []
const streamCalls: string[] = []

vi.mock("@synatra/core", () => ({
  principal: {
    orgId: () => "org-1",
    userId: () => "user-1",
  },
  getAgentById: async (id: string) => ({
    id,
    organizationId: "org-1",
  }),
  getOrCreatePlaygroundThread: async () => ({
    thread: {
      id: "thread-1",
      agentId: "agent-1",
      userId: "user-1",
      organizationId: "org-1",
      status: "waiting_human",
      seq: 12,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      workflowId: null,
    },
    created: false,
  }),
  clearPlaygroundThread: async (threadId: string) => {
    clearCalls.push(threadId)
    return { id: threadId }
  },
  findProductionEnvironment: async () => ({
    id: "env-1",
    organizationId: "org-1",
  }),
  NotFoundError: class NotFoundError extends Error {},
}))

vi.mock("../temporal", () => ({
  getTemporalClient: async () => ({
    workflow: {
      getHandle: () => ({
        cancel: async () => null,
      }),
    },
  }),
}))

vi.mock("../routes/agents/playground/stream", () => ({
  clearThreadStream: async (threadId: string) => {
    streamCalls.push(threadId)
  },
}))

const { session } = await import("../routes/agents/playground/session")

beforeEach(() => {
  clearCalls.length = 0
  streamCalls.length = 0
})

test("agents.playground.session.clear clears stream", async () => {
  const res = await session.request("/agent-1/playground/session/clear", { method: "POST" })

  expect(res.status).toBe(200)
  expect(clearCalls.length).toBe(1)
  expect(clearCalls[0]).toBe("thread-1")
  expect(streamCalls.length).toBe(1)
  expect(streamCalls[0]).toBe("thread-1")
})
