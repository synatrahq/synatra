import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
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

import {
  acquireOwnership,
  releaseOwnership,
  getConnectorOwner,
  isOwnedLocally,
  isConnectorOnlineInCluster,
  releaseAllOwnership,
  getLocalOwnershipCount,
  isOwnershipValid,
} from "../ownership"

describe("ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(async () => {
    await releaseAllOwnership()
    vi.useRealTimers()
  })

  describe("acquireOwnership", () => {
    it("acquires ownership with NX when no owner exists", async () => {
      mockRedis.set.mockResolvedValueOnce("OK")
      const { acquired, fence } = await acquireOwnership("connector-1")
      expect(acquired).toBe(true)
      expect(fence).toBeGreaterThan(0)
      expect(mockRedis.set).toHaveBeenCalledWith(
        "connector:connector-1:owner",
        expect.stringContaining("test-instance:"),
        expect.objectContaining({ NX: true, EX: 30 }),
      )
    })

    it("acquires ownership when already owned by same instance", async () => {
      mockRedis.set.mockResolvedValueOnce(null)
      mockRedis.get.mockResolvedValueOnce("test-instance:1")
      mockRedis.eval.mockResolvedValueOnce(1)
      const { acquired } = await acquireOwnership("connector-2")
      expect(acquired).toBe(true)
    })

    it("fails to acquire when owned by another instance", async () => {
      mockRedis.set.mockResolvedValueOnce(null)
      mockRedis.get.mockResolvedValueOnce("other-instance:1")
      const { acquired, fence } = await acquireOwnership("connector-3")
      expect(acquired).toBe(false)
      expect(fence).toBe(0)
    })

    it("tracks local ownership", async () => {
      mockRedis.set.mockResolvedValue("OK")
      await acquireOwnership("connector-local")
      expect(isOwnedLocally("connector-local")).toBe(true)
      expect(isOwnedLocally("unknown")).toBe(false)
    })
  })

  describe("releaseOwnership", () => {
    it("releases ownership and clears local tracking", async () => {
      mockRedis.set.mockResolvedValue("OK")
      mockRedis.eval.mockResolvedValue(1)
      await acquireOwnership("connector-release")
      expect(isOwnedLocally("connector-release")).toBe(true)
      await releaseOwnership("connector-release")
      expect(isOwnedLocally("connector-release")).toBe(false)
      expect(mockRedis.eval).toHaveBeenCalled()
    })
  })

  describe("getConnectorOwner", () => {
    it("returns instance ID from owner key", async () => {
      mockRedis.get.mockResolvedValueOnce("other-instance:5")
      const owner = await getConnectorOwner("connector-x")
      expect(owner).toBe("other-instance")
    })

    it("returns null when no owner", async () => {
      mockRedis.get.mockResolvedValueOnce(null)
      const owner = await getConnectorOwner("connector-y")
      expect(owner).toBeNull()
    })
  })

  describe("isConnectorOnlineInCluster", () => {
    it("returns true for locally owned connector", async () => {
      mockRedis.set.mockResolvedValue("OK")
      await acquireOwnership("connector-online")
      const online = await isConnectorOnlineInCluster("connector-online")
      expect(online).toBe(true)
    })

    it("checks Redis status for remote connectors", async () => {
      mockRedis.get.mockResolvedValueOnce("online")
      const online = await isConnectorOnlineInCluster("connector-remote")
      expect(online).toBe(true)
      expect(mockRedis.get).toHaveBeenCalledWith("connector:connector-remote:status")
    })

    it("returns false when status is not online", async () => {
      mockRedis.get.mockResolvedValueOnce("offline")
      const online = await isConnectorOnlineInCluster("connector-offline")
      expect(online).toBe(false)
    })
  })

  describe("releaseAllOwnership", () => {
    it("releases all locally owned connectors", async () => {
      mockRedis.set.mockResolvedValue("OK")
      mockRedis.eval.mockResolvedValue(1)
      await acquireOwnership("a")
      await acquireOwnership("b")
      expect(getLocalOwnershipCount()).toBe(2)
      await releaseAllOwnership()
      expect(getLocalOwnershipCount()).toBe(0)
    })
  })

  describe("fence token", () => {
    it("increments fence on each acquisition", async () => {
      mockRedis.set.mockResolvedValue("OK")
      const { fence: fence1 } = await acquireOwnership("fence-test-1")
      const { fence: fence2 } = await acquireOwnership("fence-test-2")
      expect(fence2).toBeGreaterThan(fence1)
    })
  })

  describe("isOwnershipValid", () => {
    it("returns true when owner matches fence", async () => {
      mockRedis.set.mockResolvedValue("OK")
      const { fence } = await acquireOwnership("connector-valid")
      mockRedis.get.mockResolvedValueOnce(`test-instance:${fence}`)
      const valid = await isOwnershipValid("connector-valid", fence)
      expect(valid).toBe(true)
    })

    it("returns false when owner mismatches fence", async () => {
      mockRedis.set.mockResolvedValue("OK")
      const { fence } = await acquireOwnership("connector-invalid")
      mockRedis.get.mockResolvedValueOnce(`test-instance:${fence + 1}`)
      const valid = await isOwnershipValid("connector-invalid", fence)
      expect(valid).toBe(false)
    })
  })
})
