import { config } from "./config"

interface PoolEntry<T> {
  pool: T
  lastUsed: number
  key: string
  refs: number
}

export class PoolManager<T> {
  private pools = new Map<string, PoolEntry<T>>()
  private maxPools: number
  private idleTtlMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private closePool: (pool: T) => Promise<void>
  private onRemove?: (key: string) => void

  constructor(closePool: (pool: T) => Promise<void>, onRemove?: (key: string) => void) {
    const cfg = config()
    this.maxPools = cfg.pool.maxPools
    this.idleTtlMs = cfg.pool.idleTtlMs
    this.closePool = closePool
    this.onRemove = onRemove
    this.startCleanup()
  }

  get(key: string): T | undefined {
    const entry = this.pools.get(key)
    if (entry) {
      entry.lastUsed = Date.now()
      return entry.pool
    }
    return undefined
  }

  hold(key: string): T | undefined {
    const entry = this.pools.get(key)
    if (!entry) return undefined
    entry.lastUsed = Date.now()
    entry.refs += 1
    return entry.pool
  }

  release(key: string): void {
    const entry = this.pools.get(key)
    if (!entry) return
    entry.refs = Math.max(0, entry.refs - 1)
    entry.lastUsed = Date.now()
  }

  async set(key: string, pool: T, refs = 0): Promise<void> {
    while (this.pools.size >= this.maxPools) {
      const removed = await this.evictOldest()
      if (!removed) break
    }

    this.pools.set(key, {
      pool,
      lastUsed: Date.now(),
      key,
      refs,
    })
  }

  async remove(key: string): Promise<void> {
    const entry = this.pools.get(key)
    if (!entry) return
    if (this.onRemove) {
      this.onRemove(key)
    }
    try {
      await this.closePool(entry.pool)
    } catch (err) {
      console.error(`[PoolManager] Error closing pool ${key}:`, err)
    }
    this.pools.delete(key)
  }

  private async evictOldest(): Promise<boolean> {
    let oldest: PoolEntry<T> | null = null

    for (const entry of this.pools.values()) {
      if (entry.refs > 0) continue
      if (!oldest || entry.lastUsed < oldest.lastUsed) {
        oldest = entry
      }
    }

    if (!oldest) return false
    console.log(`[PoolManager] Evicting oldest pool: ${oldest.key}`)
    await this.remove(oldest.key)
    return true
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      const now = Date.now()
      const toRemove: string[] = []

      for (const [key, entry] of this.pools) {
        if (entry.refs > 0) continue
        if (now - entry.lastUsed > this.idleTtlMs) {
          toRemove.push(key)
        }
      }

      for (const key of toRemove) {
        console.log(`[PoolManager] Removing idle pool: ${key}`)
        await this.remove(key)
      }
    }, 60000)
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    const keys = Array.from(this.pools.keys())
    for (const key of keys) {
      await this.remove(key)
    }
  }

  stats(): { count: number; keys: string[] } {
    return {
      count: this.pools.size,
      keys: Array.from(this.pools.keys()),
    }
  }
}
