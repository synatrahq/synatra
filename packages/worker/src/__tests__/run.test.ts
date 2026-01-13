import { describe, test, expect, vi } from "vitest"

vi.mock("../config", () => ({
  config: () => ({
    encryptionKey: "test-key",
    temporal: { address: "localhost:7233", namespace: "default", taskQueue: "agent" },
    stream: { mode: "off", redisUrl: undefined },
  }),
}))

import { getRunType } from "../activities/run"

describe("getRunType", () => {
  test("returns 'subagent' when run has parentRunId", () => {
    const run = { parentRunId: "parent-123" }
    const thread = { triggerId: null }
    expect(getRunType(run as any, thread)).toBe("subagent")
  })

  test("returns 'subagent' even if thread has triggerId", () => {
    const run = { parentRunId: "parent-123" }
    const thread = { triggerId: "trigger-456" }
    expect(getRunType(run as any, thread)).toBe("subagent")
  })

  test("returns 'trigger' when thread has triggerId and no parentRunId", () => {
    const run = { parentRunId: null }
    const thread = { triggerId: "trigger-456" }
    expect(getRunType(run as any, thread)).toBe("trigger")
  })

  test("returns 'user' when no parentRunId and no triggerId", () => {
    const run = { parentRunId: null }
    const thread = { triggerId: null }
    expect(getRunType(run as any, thread)).toBe("user")
  })

  test("returns 'user' when parentRunId is undefined", () => {
    const run = {}
    const thread = { triggerId: null }
    expect(getRunType(run as any, thread)).toBe("user")
  })
})
