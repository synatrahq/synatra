import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mocks = vi.hoisted(() => ({
  acquireOwnership: vi.fn(),
  releaseOwnership: vi.fn(),
  releaseAllOwnership: vi.fn(),
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
  releaseAllOwnership: mocks.releaseAllOwnership,
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

import { WebSocket } from "ws"
import { registerConnection, unregisterConnection, handleMessage, dispatchCommand } from "../coordinator"
import * as ownership from "../ownership"

describe("coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.acquireOwnership.mockResolvedValue({ acquired: true, fence: 1 })
    mocks.isRedisEnabled.mockReturnValue(false)
  })

  afterEach(async () => {
    await unregisterConnection("connector-1")
  })

  it("does not unregister when closing an old connection if ready connection remains", async () => {
    const ws1 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const ws2 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any

    mocks.isOwnershipValid.mockResolvedValue(true)

    await registerConnection(ws1, info)
    await registerConnection(ws2, info)

    await handleMessage("connector-1", ws2, { type: "register", payload: { version: "1.0", platform: "test" } })

    await unregisterConnection("connector-1", ws1)

    expect(mocks.acquireOwnership).toHaveBeenCalledTimes(1)
    expect(mocks.releaseOwnership).not.toHaveBeenCalled()
    expect(mocks.setStatus).not.toHaveBeenCalledWith({ connectorId: "connector-1", status: "offline" })
  })

  it("validates token on heartbeat when redis enabled and version unchanged", async () => {
    const ws = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any
    const redis = { get: vi.fn() }

    mocks.isRedisEnabled.mockReturnValue(true)
    mocks.getRedis.mockResolvedValue(redis)
    redis.get.mockResolvedValue("1")
    mocks.verifyConnectorStillValid.mockResolvedValue(true)

    await registerConnection(ws, info)
    await handleMessage("connector-1", ws, { type: "heartbeat" } as any)

    expect(mocks.verifyConnectorStillValid).toHaveBeenCalledWith("connector-1", "hash")
  })

  it("validates heartbeat against connection token hash", async () => {
    const ws1 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const ws2 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const info1 = { id: "connector-1", name: "test", tokenHash: "hash-1", organizationId: "org-1" } as any
    const info2 = { id: "connector-1", name: "test", tokenHash: "hash-2", organizationId: "org-1" } as any

    mocks.verifyConnectorStillValid.mockResolvedValue(true)

    await registerConnection(ws1, info1)
    await registerConnection(ws2, info2)
    await handleMessage("connector-1", ws1, { type: "heartbeat" } as any)

    expect(mocks.verifyConnectorStillValid).toHaveBeenCalledWith("connector-1", "hash-1")
  })

  it("skips command dispatch when ownership is invalid", async () => {
    const ws = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
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

  it("sends register_ok on register", async () => {
    const ws = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any
    const payload = { version: "1.0.0", platform: "test", capabilities: ["postgres"] }

    await registerConnection(ws, info)
    await handleMessage("connector-1", ws, { type: "register", payload } as any)

    const messages = ws.send.mock.calls.map(([value]: [string]) => JSON.parse(value)) as Array<{
      type?: string
    }>
    expect(messages.some((msg: { type?: string }) => msg.type === "register_ok")).toBe(true)
  })

  it("starts a single command consumer per connector", async () => {
    const ws1 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const ws2 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any

    mocks.isRedisEnabled.mockReturnValue(true)
    mocks.startCommandConsumer.mockResolvedValue(() => {})

    await registerConnection(ws1, info)
    await registerConnection(ws2, info)

    expect(mocks.startCommandConsumer).toHaveBeenCalledTimes(1)
  })

  it("serializes concurrent registrations for the same connector", async () => {
    const ws1 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const ws2 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any

    mocks.isOwnershipValid.mockResolvedValue(true)

    await Promise.all([registerConnection(ws1, info), registerConnection(ws2, info)])

    expect(mocks.acquireOwnership).toHaveBeenCalledTimes(1)
  })

  it("returns service unavailable when local connector has no active connection", async () => {
    vi.mocked(ownership.isOwnedLocally).mockReturnValue(true)

    await expect(dispatchCommand("connector-1", { type: "query", payload: {} as any })).rejects.toMatchObject({
      name: "ServiceUnavailableError",
    })
  })

  it("reacquires ownership when existing group is no longer valid", async () => {
    const ws1 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const ws2 = { close: vi.fn(), send: vi.fn(), readyState: WebSocket.OPEN } as any
    const info = { id: "connector-1", name: "test", tokenHash: "hash", organizationId: "org-1" } as any

    mocks.isOwnershipValid.mockResolvedValue(false)
    mocks.acquireOwnership.mockResolvedValueOnce({ acquired: true, fence: 1 })
    mocks.acquireOwnership.mockResolvedValueOnce({ acquired: true, fence: 2 })

    await registerConnection(ws1, info)
    await registerConnection(ws2, info)

    expect(mocks.acquireOwnership).toHaveBeenCalledTimes(2)
  })
})
