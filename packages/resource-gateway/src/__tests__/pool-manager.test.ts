import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest"

vi.mock("../config", () => ({
  config: () => ({
    pool: {
      maxPools: 3,
      idleTtlMs: 1000,
    },
  }),
}))

import { PoolManager } from "../pool-manager"

describe("PoolManager", () => {
  let closePool: Mock<(pool: { id: string }) => Promise<void>>
  let onRemove: Mock<(key: string) => void>
  let manager: PoolManager<{ id: string }>

  beforeEach(() => {
    vi.useFakeTimers()
    closePool = vi.fn<(pool: { id: string }) => Promise<void>>().mockResolvedValue(undefined)
    onRemove = vi.fn<(key: string) => void>()
    manager = new PoolManager(closePool, onRemove)
  })

  afterEach(async () => {
    await manager.shutdown()
    vi.useRealTimers()
  })

  describe("get/set", () => {
    it("returns undefined for non-existent key", () => {
      expect(manager.get("unknown")).toBeUndefined()
    })

    it("stores and retrieves pool", async () => {
      const pool = { id: "pool-1" }
      await manager.set("key-1", pool)
      expect(manager.get("key-1")).toBe(pool)
    })

    it("updates lastUsed on get", async () => {
      const pool = { id: "pool-1" }
      await manager.set("key-1", pool)
      vi.advanceTimersByTime(500)
      manager.get("key-1")
      const stats = manager.stats()
      expect(stats.count).toBe(1)
    })
  })

  describe("LRU eviction", () => {
    it("evicts oldest pool when maxPools reached", async () => {
      await manager.set("a", { id: "a" })
      vi.advanceTimersByTime(100)
      await manager.set("b", { id: "b" })
      vi.advanceTimersByTime(100)
      await manager.set("c", { id: "c" })
      expect(manager.stats().count).toBe(3)

      await manager.set("d", { id: "d" })
      expect(manager.stats().count).toBe(3)
      expect(manager.get("a")).toBeUndefined()
      expect(manager.get("d")).toBeDefined()
      expect(closePool).toHaveBeenCalledTimes(1)
    })

    it("evicts least recently used when accessed pools exist", async () => {
      await manager.set("a", { id: "a" })
      vi.advanceTimersByTime(100)
      await manager.set("b", { id: "b" })
      vi.advanceTimersByTime(100)
      await manager.set("c", { id: "c" })

      manager.get("a")
      vi.advanceTimersByTime(100)

      await manager.set("d", { id: "d" })
      expect(manager.get("a")).toBeDefined()
      expect(manager.get("b")).toBeUndefined()
    })

    it("skips in-use pools during eviction", async () => {
      await manager.set("a", { id: "a" })
      vi.advanceTimersByTime(100)
      await manager.set("b", { id: "b" })
      vi.advanceTimersByTime(100)
      await manager.set("c", { id: "c" })

      manager.hold("a")
      vi.advanceTimersByTime(100)

      await manager.set("d", { id: "d" })
      expect(manager.get("a")).toBeDefined()
      expect(manager.get("b")).toBeUndefined()
      manager.release("a")
    })
  })

  describe("remove", () => {
    it("removes pool and calls closePool", async () => {
      const pool = { id: "pool-1" }
      await manager.set("key-1", pool)
      await manager.remove("key-1")
      expect(manager.get("key-1")).toBeUndefined()
      expect(closePool).toHaveBeenCalledWith(pool)
      expect(onRemove).toHaveBeenCalledWith("key-1")
    })

    it("handles error in closePool", async () => {
      closePool.mockRejectedValueOnce(new Error("close error"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const pool = { id: "pool-1" }
      await manager.set("key-1", pool)
      await manager.remove("key-1")
      expect(manager.get("key-1")).toBeUndefined()
      consoleSpy.mockRestore()
    })
  })

  describe("idle cleanup", () => {
    it("removes idle pools after TTL when cleanup interval runs", async () => {
      await manager.set("key-1", { id: "pool-1" })
      expect(manager.stats().count).toBe(1)
      vi.advanceTimersByTime(1001)
      await vi.advanceTimersByTimeAsync(60000)
      expect(manager.stats().count).toBe(0)
    })

    it("keeps recently used pools during cleanup", async () => {
      await manager.set("key-1", { id: "pool-1" })
      vi.advanceTimersByTime(59500)
      manager.get("key-1")
      await vi.advanceTimersByTimeAsync(600)
      expect(manager.stats().count).toBe(1)
    })
  })

  describe("shutdown", () => {
    it("closes all pools", async () => {
      await manager.set("a", { id: "a" })
      await manager.set("b", { id: "b" })
      await manager.shutdown()
      expect(manager.stats().count).toBe(0)
      expect(closePool).toHaveBeenCalledTimes(2)
    })
  })

  describe("stats", () => {
    it("returns count and keys", async () => {
      await manager.set("x", { id: "x" })
      await manager.set("y", { id: "y" })
      const stats = manager.stats()
      expect(stats.count).toBe(2)
      expect(stats.keys).toContain("x")
      expect(stats.keys).toContain("y")
    })
  })
})
