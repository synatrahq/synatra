import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mocks = vi.hoisted(() => ({
  acquireOwnership: vi.fn(),
  releaseOwnership: vi.fn(),
  setStatus: vi.fn(),
  startCommandConsumer: vi.fn(),
  isRedisEnabled: vi.fn(),
  getRedis: vi.fn(),
  verifyConnectorStillValid: vi.fn(),
  isOwnershipValid: vi.fn(),
}))

vi.mock("../ownership", () => ({
  acquireOwnership: mocks.acquireOwnership,
  releaseOwnership: mocks.releaseOwnership,
  isOwnedLocally: vi.fn(),
  isConnectorOnlineInCluster: vi.fn(),
  getLocalOwnershipCount: vi.fn(() => 0),
  isOwnershipValid: mocks.isOwnershipValid,
  onOwnershipLost: vi.fn(),
  removeOwnershipLostCallback: vi.fn(),
}))

vi.mock("../redis-client", () => ({
  isRedisEnabled: mocks.isRedisEnabled,
  getRedis: mocks.getRedis,
}))

vi.mock("../command-stream", () => ({
  dispatchRemoteCommand: vi.fn(),
  publishReply: vi.fn(),
  startCommandConsumer: mocks.startCommandConsumer,
}))

vi.mock("@synatra/core", () => ({
  principal: {
    withSystem: vi.fn((_ctx, fn) => fn()),
  },
  setConnectorStatus: mocks.setStatus,
  setConnectorMetadata: vi.fn(),
  setConnectorLastSeen: vi.fn(),
}))

vi.mock("../connector-auth", () => ({
  verifyConnectorStillValid: mocks.verifyConnectorStillValid,
}))

import { registerConnection, unregisterConnection, handleMessage } from "../coordinator"

describe("coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.acquireOwnership.mockResolvedValue({ acquired: true, fence: 1 })
    mocks.isRedisEnabled.mockReturnValue(false)
  })

  afterEach(async () => {
    await unregisterConnection("connector-1")
  })

  it("does not unregister when closing an old connection", async () => {
    const ws1 = { close: vi.fn(), send: vi.fn() } as any
    const ws2 = { close: vi.fn(), send: vi.fn() } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any

    await registerConnection(ws1, info)
    await registerConnection(ws2, info)

    await unregisterConnection("connector-1", ws1)

    expect(mocks.releaseOwnership).not.toHaveBeenCalled()
    expect(mocks.setStatus).not.toHaveBeenCalledWith({ connectorId: "connector-1", status: "offline" })
  })

  it("validates token on heartbeat when redis enabled and version unchanged", async () => {
    const ws = { close: vi.fn(), send: vi.fn() } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any
    const redis = { get: vi.fn() }

    mocks.isRedisEnabled.mockReturnValue(true)
    mocks.getRedis.mockResolvedValue(redis)
    redis.get.mockResolvedValue("1")
    mocks.verifyConnectorStillValid.mockResolvedValue(true)

    await registerConnection(ws, info)
    await handleMessage("connector-1", { type: "heartbeat" } as any)

    expect(mocks.verifyConnectorStillValid).toHaveBeenCalledWith("connector-1", "hash")
  })

  it("skips command dispatch when ownership is invalid", async () => {
    const ws = { close: vi.fn(), send: vi.fn() } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any
    let handler: ((command: any) => Promise<boolean>) | undefined

    mocks.isRedisEnabled.mockReturnValue(true)
    mocks.isOwnershipValid.mockResolvedValue(false)
    mocks.startCommandConsumer.mockImplementation(async (_id, h) => {
      handler = h
      return () => {}
    })

    await registerConnection(ws, info)

    const result = await handler?.({ correlationId: "c1", replyTo: "r1" } as any)
    expect(result).toBe(false)
    expect(ws.send).not.toHaveBeenCalled()
  })
})
