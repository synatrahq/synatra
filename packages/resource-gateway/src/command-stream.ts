import { randomUUID } from "crypto"
import { getRedis, isRedisEnabled } from "./redis-client"
import { config } from "./config"
import { isConnectorOnlineInCluster } from "./ownership"
import type { CloudCommand } from "./ws-types"

const COMMAND_TIMEOUT_MS = 630000
const STREAM_MAXLEN = 1000
const PROCESSED_CACHE_TTL_MS = 5 * 60 * 1000

interface StreamMessage {
  id: string
  message: Record<string, string>
}

interface StreamResult {
  name: string
  messages: StreamMessage[]
}

interface PendingCommand {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const pendingCommands = new Map<string, PendingCommand>()
const processedIds = new Set<string>()
let replyConsumerActive = false
let replyConsumerPromise: Promise<void> | null = null

function cmdStreamKey(connectorId: string): string {
  return `cmd:${connectorId}`
}

function replyStreamKey(instanceId: string): string {
  return `reply:${instanceId}`
}

export async function dispatchRemoteCommand<T>(
  connectorId: string,
  command: Omit<CloudCommand, "correlationId">,
): Promise<T> {
  const redis = await getRedis()
  if (!redis) throw new Error("Redis not available")

  const online = await isConnectorOnlineInCluster(connectorId)
  if (!online) {
    throw new Error(`Connector ${connectorId} is not online`)
  }

  const cfg = config()
  const correlationId = randomUUID()

  const fullCommand = {
    ...command,
    correlationId,
    replyTo: cfg.instanceId,
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(correlationId)
      reject(new Error(`Command timeout after ${COMMAND_TIMEOUT_MS}ms`))
    }, COMMAND_TIMEOUT_MS)

    pendingCommands.set(correlationId, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timeout,
    })

    redis
      .xAdd(
        cmdStreamKey(connectorId),
        "*",
        {
          data: JSON.stringify(fullCommand),
          deadline: String(Date.now() + COMMAND_TIMEOUT_MS),
        },
        { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: STREAM_MAXLEN } },
      )
      .catch((err: Error) => {
        clearTimeout(timeout)
        pendingCommands.delete(correlationId)
        reject(err)
      })
  })
}

export async function publishReply(
  correlationId: string,
  replyTo: string,
  payload: unknown,
  isError = false,
): Promise<void> {
  const redis = await getRedis()
  if (!redis) return

  await redis.xAdd(
    replyStreamKey(replyTo),
    "*",
    {
      correlationId,
      data: JSON.stringify(payload),
      status: isError ? "error" : "ok",
    },
    { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: STREAM_MAXLEN } },
  )
}

export async function startReplyConsumer(): Promise<void> {
  if (!isRedisEnabled() || replyConsumerActive) return

  const redis = await getRedis()
  if (!redis) return

  replyConsumerActive = true
  const cfg = config()
  const key = replyStreamKey(cfg.instanceId)
  const groupName = `gateway-${cfg.instanceId}`

  try {
    await redis.xGroupCreate(key, groupName, "0", { MKSTREAM: true })
  } catch {}

  replyConsumerPromise = consumeReplies(redis, key, groupName)
}

async function consumeReplies(
  redis: NonNullable<Awaited<ReturnType<typeof getRedis>>>,
  key: string,
  groupName: string,
): Promise<void> {
  const cfg = config()

  while (replyConsumerActive) {
    try {
      const results = (await redis.xReadGroup(groupName, cfg.instanceId, [{ key, id: ">" }], {
        COUNT: 50,
        BLOCK: 5000,
      })) as StreamResult[] | null

      if (!results) continue

      for (const stream of results as StreamResult[]) {
        for (const message of stream.messages) {
          const correlationId = message.message.correlationId
          const data = message.message.data
          const status = message.message.status

          const pending = pendingCommands.get(correlationId)
          if (pending) {
            clearTimeout(pending.timeout)
            pendingCommands.delete(correlationId)

            if (status === "error") {
              const error = JSON.parse(data)
              pending.reject(new Error(error.message || "Remote error"))
            }
            if (status !== "error") {
              pending.resolve(JSON.parse(data))
            }
          }

          await redis.xAck(key, groupName, message.id)
        }
      }
    } catch (err) {
      if (replyConsumerActive) {
        console.error("[CommandStream] Reply consumer error:", err)
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }
}

const AUTOCLAIM_MIN_IDLE_MS = COMMAND_TIMEOUT_MS
const AUTOCLAIM_MAX_ITERATIONS = 10
const CLAIM_INTERVAL_MS = 5000

function parseAutoClaimResult(result: unknown): { nextId: string; messages: StreamMessage[] } | null {
  if (!result) return null

  let nextId: string
  let rawMessages: unknown[]

  if (Array.isArray(result)) {
    const [first, second] = result
    if (typeof first !== "string" || !Array.isArray(second)) return null
    nextId = first
    rawMessages = second
  } else if (typeof result === "object") {
    const obj = result as Record<string, unknown>
    if (typeof obj.nextId !== "string" || !Array.isArray(obj.messages)) return null
    nextId = obj.nextId
    rawMessages = obj.messages
  } else {
    return null
  }

  return { nextId, messages: rawMessages as StreamMessage[] }
}

export async function startCommandConsumer(
  connectorId: string,
  handler: (command: CloudCommand & { replyTo: string }) => Promise<boolean>,
): Promise<() => void> {
  const redis = await getRedis()
  if (!redis) return () => {}

  const cfg = config()
  const key = cmdStreamKey(connectorId)
  const groupName = "owner"
  const consumerName = cfg.instanceId
  let active = true
  let claimInFlight = false

  try {
    await redis.xGroupCreate(key, groupName, "0", { MKSTREAM: true })
  } catch {}

  const claimPending = async () => {
    if (!active) return
    if (claimInFlight) return
    claimInFlight = true
    let startId = "0-0"
    let iterations = 0

    try {
      while (iterations < AUTOCLAIM_MAX_ITERATIONS) {
        iterations++
        const rawResult = await redis.xAutoClaim(key, groupName, consumerName, AUTOCLAIM_MIN_IDLE_MS, startId, {
          COUNT: 50,
        })

        const claimed = parseAutoClaimResult(rawResult)
        if (!claimed || !claimed.messages.length) break

        for (const message of claimed.messages) {
          await processMessage(redis, key, groupName, message, handler)
        }

        if (!claimed.nextId || claimed.nextId === "0-0") break
        startId = claimed.nextId
      }
    } catch (err) {
      console.error("[CommandStream] Auto-claim error:", err)
    } finally {
      claimInFlight = false
    }
  }

  const processMessage = async (
    r: NonNullable<Awaited<ReturnType<typeof getRedis>>>,
    k: string,
    g: string,
    message: StreamMessage,
    h: (command: CloudCommand & { replyTo: string }) => Promise<boolean>,
  ) => {
    if (!message || typeof message.id !== "string" || !message.message || typeof message.message !== "object") {
      return
    }

    const payload = message.message as Record<string, string>
    const deadline = parseInt(payload.deadline || "0", 10)

    if (deadline && Date.now() > deadline) {
      await r.xAck(k, g, message.id)
      return
    }

    if (!payload.data || typeof payload.data !== "string") {
      await r.xAck(k, g, message.id)
      return
    }

    let command: CloudCommand & { replyTo: string }
    try {
      command = JSON.parse(payload.data) as CloudCommand & { replyTo: string }
    } catch {
      await r.xAck(k, g, message.id)
      return
    }

    if (processedIds.has(command.correlationId)) {
      await r.xAck(k, g, message.id)
      return
    }

    let success = false
    try {
      success = await h(command)
    } catch (err) {
      console.error("[CommandStream] Handler error:", err)
    }

    if (success) {
      processedIds.add(command.correlationId)
      setTimeout(() => processedIds.delete(command.correlationId), PROCESSED_CACHE_TTL_MS)
      await r.xAck(k, g, message.id)
    }
  }

  const claimInterval = setInterval(() => {
    claimPending().catch((err) => {
      console.error("[CommandStream] Scheduled claim error:", err)
    })
  }, CLAIM_INTERVAL_MS)

  const consume = async () => {
    await claimPending()

    while (active) {
      try {
        const results = (await redis.xReadGroup(groupName, consumerName, [{ key, id: ">" }], {
          COUNT: 10,
          BLOCK: 5000,
        })) as StreamResult[] | null

        if (!results) continue

        for (const stream of results as StreamResult[]) {
          for (const message of stream.messages) {
            await processMessage(redis, key, groupName, message, handler)
          }
        }
      } catch (err) {
        if (active) {
          console.error("[CommandStream] Command consumer error:", err)
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    }
  }

  void consume().catch((err) => {
    console.error("[CommandStream] Command consumer fatal error:", err)
  })

  return () => {
    active = false
    clearInterval(claimInterval)
  }
}

export function stopReplyConsumer(): void {
  replyConsumerActive = false
}

export function clearPendingCommands(): void {
  for (const [, pending] of pendingCommands) {
    clearTimeout(pending.timeout)
    pending.reject(new Error("Shutting down"))
  }
  pendingCommands.clear()
}

export function getPendingCommandCount(): number {
  return pendingCommands.size
}
