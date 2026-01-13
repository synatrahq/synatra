import { threadStreamEventSchemas, type ThreadStreamEventType } from "@synatra/core/thread-events"
import { createClient } from "redis"
import { config } from "../config"

export type ThreadEventType =
  | Extract<ThreadStreamEventType, "message.created" | "thread.status_changed">
  | "run.created"
  | "run.updated"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "run.rejected"
  | "output_item.created"
  | "human_request.created"
  | "human_request.resolved"

const workerConfig = config()
const THREAD_STREAM_MODE = workerConfig.stream.mode
const REDIS_URL = workerConfig.stream.redisUrl

type RedisClient = ReturnType<typeof createClient>

let redisClientPromise: Promise<RedisClient | null> | null = null

export const streamingEnabled = THREAD_STREAM_MODE === "redis" && !!REDIS_URL

function getThreadStreamKey(threadId: string): string {
  return `stream:thread:${threadId}`
}

async function getRedisClient(): Promise<RedisClient | null> {
  if (THREAD_STREAM_MODE !== "redis") return null
  if (!REDIS_URL) return null

  if (!redisClientPromise) {
    redisClientPromise = createClient({ url: REDIS_URL })
      .on("error", (error) => console.error("Redis connection error", error))
      .connect()
      .then((client) => client)
      .catch(() => {
        redisClientPromise = null
        return null
      })
  }

  return redisClientPromise
}

export async function emitThreadEvent(input: {
  threadId: string
  type: ThreadEventType
  seq: number
  data: unknown
  updatedAt?: Date
}): Promise<void> {
  const updatedAt = input.updatedAt ?? new Date()

  if (THREAD_STREAM_MODE !== "redis") return

  const schemaType = input.type as ThreadStreamEventType
  const validator = schemaType in threadStreamEventSchemas ? threadStreamEventSchemas[schemaType] : null
  if (validator) {
    const parsed = validator.safeParse(input.data)
    if (!parsed.success) {
      console.error("Thread event validation failed", input.type, parsed.error)
      return
    }
  }

  const redis = await getRedisClient()
  if (!redis) return

  const payload = {
    seq: input.seq,
    threadId: input.threadId,
    type: input.type,
    data: input.data,
    updatedAt: updatedAt.toISOString(),
  }

  try {
    await redis.xAdd(
      getThreadStreamKey(input.threadId),
      `${input.seq}-0`,
      {
        seq: String(input.seq),
        threadId: input.threadId,
        type: input.type,
        data: JSON.stringify(payload.data),
        updatedAt: payload.updatedAt,
      },
      { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 2000 } },
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes("ID specified in XADD")) return
    console.error("Failed to emit thread event", error)
  }
}
