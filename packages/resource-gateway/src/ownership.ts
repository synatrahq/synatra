import { getRedis, isRedisEnabled } from "./redis-client"
import { config } from "./config"

const OWNER_TTL_SEC = 30
const STATUS_TTL_SEC = 60
const REFRESH_INTERVAL_MS = 10000

interface OwnershipEntry {
  fence: number
  refreshTimer: ReturnType<typeof setInterval>
}

const localOwnership = new Map<string, OwnershipEntry>()
const ownershipLostCallbacks = new Map<string, () => void>()
let fenceCounter = 0

function ownerKey(connectorId: string): string {
  return `connector:${connectorId}:owner`
}

function statusKey(connectorId: string): string {
  return `connector:${connectorId}:status`
}

export async function acquireOwnership(connectorId: string): Promise<{ acquired: boolean; fence: number }> {
  if (!isRedisEnabled()) {
    const fence = ++fenceCounter
    localOwnership.set(connectorId, { fence, refreshTimer: setInterval(() => {}, 1000000) })
    return { acquired: true, fence }
  }

  const redis = await getRedis()
  if (!redis) {
    throw new Error("Redis unavailable in distributed mode")
  }

  const cfg = config()
  const fence = ++fenceCounter
  const ownerValue = `${cfg.instanceId}:${fence}`

  const acquired = await redis.set(ownerKey(connectorId), ownerValue, {
    NX: true,
    EX: OWNER_TTL_SEC,
  })

  if (!acquired) {
    const current = await redis.get(ownerKey(connectorId))
    if (!current?.startsWith(`${cfg.instanceId}:`)) return { acquired: false, fence: 0 }
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
        return 1
      end
      return 0
    `
    const ok = await redis.eval(script, {
      keys: [ownerKey(connectorId)],
      arguments: [current, ownerValue, String(OWNER_TTL_SEC)],
    })
    if (ok !== 1) return { acquired: false, fence: 0 }
  }

  await redis.set(statusKey(connectorId), "online", { EX: STATUS_TTL_SEC })

  const existing = localOwnership.get(connectorId)
  if (existing) {
    clearInterval(existing.refreshTimer)
    localOwnership.delete(connectorId)
  }

  const refreshTimer = setInterval(() => {
    refreshOwnership(connectorId, fence).catch((err) => {
      console.error(`[Ownership] Refresh error for ${connectorId}:`, err)
    })
  }, REFRESH_INTERVAL_MS)

  localOwnership.set(connectorId, { fence, refreshTimer })
  return { acquired: true, fence }
}

async function refreshOwnership(connectorId: string, expectedFence: number): Promise<boolean> {
  const entry = localOwnership.get(connectorId)
  if (!entry || entry.fence !== expectedFence) return false

  const redis = await getRedis()
  if (!redis) return true

  const cfg = config()
  const ownerValue = `${cfg.instanceId}:${expectedFence}`

  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      redis.call("EXPIRE", KEYS[1], ARGV[2])
      redis.call("EXPIRE", KEYS[2], ARGV[3])
      return 1
    end
    return 0
  `

  const result = await redis.eval(script, {
    keys: [ownerKey(connectorId), statusKey(connectorId)],
    arguments: [ownerValue, String(OWNER_TTL_SEC), String(STATUS_TTL_SEC)],
  })

  if (result === 0) {
    console.log(`[Ownership] Lost ownership for ${connectorId}, closing connection`)
    clearInterval(entry.refreshTimer)
    localOwnership.delete(connectorId)
    const callback = ownershipLostCallbacks.get(connectorId)
    if (callback) {
      ownershipLostCallbacks.delete(connectorId)
      callback()
    }
    return false
  }

  return true
}

export async function releaseOwnership(connectorId: string): Promise<void> {
  const entry = localOwnership.get(connectorId)
  if (entry) {
    clearInterval(entry.refreshTimer)
    localOwnership.delete(connectorId)
  }
  ownershipLostCallbacks.delete(connectorId)

  const redis = await getRedis()
  if (!redis) return

  const cfg = config()

  const script = `
    local owner = redis.call("GET", KEYS[1])
    if owner and string.find(owner, ARGV[1], 1, true) == 1 then
      redis.call("DEL", KEYS[1])
      redis.call("SET", KEYS[2], "offline", "EX", ARGV[2])
      return 1
    end
    return 0
  `

  await redis.eval(script, {
    keys: [ownerKey(connectorId), statusKey(connectorId)],
    arguments: [`${cfg.instanceId}:`, String(STATUS_TTL_SEC)],
  })
}

export async function getConnectorOwner(connectorId: string): Promise<string | null> {
  if (!isRedisEnabled()) {
    return localOwnership.has(connectorId) ? config().instanceId : null
  }

  const redis = await getRedis()
  if (!redis) {
    return localOwnership.has(connectorId) ? config().instanceId : null
  }

  const owner = await redis.get(ownerKey(connectorId))
  return owner?.split(":")[0] ?? null
}

export function getConnectorOwnerLocal(connectorId: string): string | null {
  return localOwnership.has(connectorId) ? config().instanceId : null
}

export function isOwnedLocally(connectorId: string): boolean {
  return localOwnership.has(connectorId)
}

export function onOwnershipLost(connectorId: string, callback: () => void): void {
  ownershipLostCallbacks.set(connectorId, callback)
}

export function removeOwnershipLostCallback(connectorId: string): void {
  ownershipLostCallbacks.delete(connectorId)
}

export async function isConnectorOnlineInCluster(connectorId: string): Promise<boolean> {
  if (localOwnership.has(connectorId)) return true

  if (!isRedisEnabled()) return false

  const redis = await getRedis()
  if (!redis) return false

  const status = await redis.get(statusKey(connectorId))
  return status === "online"
}

export async function releaseAllOwnership(): Promise<void> {
  const connectorIds = Array.from(localOwnership.keys())
  for (const connectorId of connectorIds) {
    await releaseOwnership(connectorId)
  }
}

export function getLocalOwnershipCount(): number {
  return localOwnership.size
}

export async function isOwnershipValid(connectorId: string, expectedFence: number): Promise<boolean> {
  const entry = localOwnership.get(connectorId)
  if (!entry || entry.fence !== expectedFence) return false

  if (!isRedisEnabled()) return true

  const redis = await getRedis()
  if (!redis) return true

  const owner = await redis.get(ownerKey(connectorId))
  if (!owner) return false

  return owner === `${config().instanceId}:${expectedFence}`
}
