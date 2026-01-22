import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockRedis = {
  xAdd: vi.fn(),
  xReadGroup: vi.fn(),
  xGroupCreate: vi.fn(),
  xAck: vi.fn(),
  xAutoClaim: vi.fn(),
}

vi.mock("../config", () => ({
  config: () => ({
    instanceId: "test-instance",
    pool: { maxPools: 50, idleTtlMs: 300000 },
  }),
}))

vi.mock("../redis-client", () => ({
  isRedisEnabled: vi.fn(() => true),
  getRedis: vi.fn(() => Promise.resolve(mockRedis)),
}))

vi.mock("../ownership", () => ({
  isConnectorOnlineInCluster: vi.fn(() => Promise.resolve(true)),
}))

import {
  publishReply,
  getPendingCommandCount,
  clearPendingCommands,
  stopReplyConsumer,
  startCommandConsumer,
} from "../command-stream"

describe("command-stream", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopReplyConsumer()
    clearPendingCommands()
  })

  describe("publishReply", () => {
    it("publishes success reply to stream", async () => {
      mockRedis.xAdd.mockResolvedValueOnce("1-0")
      await publishReply("corr-123", "requester-instance", { result: "ok" })

      expect(mockRedis.xAdd).toHaveBeenCalledWith(
        "reply:requester-instance",
        "*",
        {
          correlationId: "corr-123",
          data: JSON.stringify({ result: "ok" }),
          status: "ok",
        },
        expect.any(Object),
      )
    })

    it("publishes error reply to stream", async () => {
      mockRedis.xAdd.mockResolvedValueOnce("1-0")
      await publishReply("corr-456", "requester-instance", { message: "failed" }, true)

      expect(mockRedis.xAdd).toHaveBeenCalledWith(
        "reply:requester-instance",
        "*",
        {
          correlationId: "corr-456",
          data: JSON.stringify({ message: "failed" }),
          status: "error",
        },
        expect.any(Object),
      )
    })
  })

  describe("getPendingCommandCount", () => {
    it("returns 0 initially", () => {
      expect(getPendingCommandCount()).toBe(0)
    })
  })

  describe("clearPendingCommands", () => {
    it("does not throw when no pending commands", () => {
      expect(() => clearPendingCommands()).not.toThrow()
      expect(getPendingCommandCount()).toBe(0)
    })
  })

  describe("startCommandConsumer", () => {
    it("uses command timeout for auto-claim min idle", async () => {
      vi.useFakeTimers()
      let resolveRead: (value: unknown) => void = () => {}
      mockRedis.xGroupCreate.mockResolvedValueOnce("OK")
      mockRedis.xAutoClaim.mockResolvedValueOnce(["0-0", []])
      mockRedis.xReadGroup.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve
          }),
      )

      const stop = await startCommandConsumer("connector-1", async () => true)
      expect(mockRedis.xAutoClaim).toHaveBeenCalledWith("cmd:connector-1", "owner", "test-instance", 630000, "0-0", {
        COUNT: 50,
      })

      stop()
      resolveRead(null)
      await Promise.resolve()
      vi.useRealTimers()
    })
  })
})
