import { Hono } from "hono"
import { createClient } from "redis"
import { principal, getThreadById, getAgentById } from "@synatra/core"
import { config } from "../../../config"
import { createError } from "@synatra/util/error"

const serverConfig = config()
const THREAD_STREAM_MODE = serverConfig.stream.mode
const REDIS_URL = serverConfig.stream.redisUrl

type RedisClient = ReturnType<typeof createClient>

let subscriberPromise: Promise<RedisClient | null> | null = null
let publisherPromise: Promise<RedisClient | null> | null = null

function streamKey(threadId: string): string {
  return `stream:thread:${threadId}`
}

function buildRedisClient(): Promise<RedisClient | null> {
  if (!REDIS_URL) return Promise.resolve(null)

  return createClient({
    url: REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(1000 * 2 ** retries, 10000) },
  })
    .on("error", (error) => console.error("Redis subscriber error", error))
    .connect()
    .then((client) => client)
    .catch(() => null)
}

async function getSubscriber(): Promise<RedisClient | null> {
  if (THREAD_STREAM_MODE !== "redis") return null
  if (!subscriberPromise) {
    subscriberPromise = buildRedisClient().then((client) => {
      if (!client) subscriberPromise = null
      return client
    })
  }
  return subscriberPromise
}

async function getPublisher(): Promise<RedisClient | null> {
  if (THREAD_STREAM_MODE !== "redis") return null
  if (!publisherPromise) {
    publisherPromise = buildRedisClient().then((client) => {
      if (!client) publisherPromise = null
      return client
    })
  }
  return publisherPromise
}

export async function emitThreadEvent(input: {
  threadId: string
  seq: number
  type: string
  data: Record<string, unknown>
  updatedAt?: Date
}): Promise<void> {
  const publisher = await getPublisher()
  if (!publisher) return

  const key = streamKey(input.threadId)
  const updatedAt = (input.updatedAt ?? new Date()).toISOString()

  try {
    await publisher.xAdd(
      key,
      `${input.seq}-0`,
      {
        seq: String(input.seq),
        threadId: input.threadId,
        type: input.type,
        data: JSON.stringify({ ...input.data, updatedAt }),
        updatedAt,
      },
      { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 2000 } },
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes("ID specified in XADD")) return
    console.error("Failed to emit thread event", error)
  }
}

export async function clearThreadStream(threadId: string): Promise<void> {
  const publisher = await getPublisher()
  if (!publisher) return
  try {
    await publisher.del(streamKey(threadId))
  } catch (error) {
    console.error("Failed to clear thread stream", error)
  }
}

type StreamEntry = {
  id: string
  message: Record<string, string>
}

function parseEntry(threadId: string, entry: StreamEntry) {
  const seq = Number(entry.id.split("-")[0])
  const data = entry.message.data ? JSON.parse(entry.message.data) : null
  return {
    seq,
    sessionId: entry.message.threadId ?? threadId,
    type: entry.message.type,
    data,
    updatedAt: entry.message.updatedAt,
  }
}

export const stream = new Hono().get("/:id/playground/stream", async (c) => {
  if (THREAD_STREAM_MODE !== "redis") {
    return c.text("Debug stream is disabled", 501)
  }

  const agentId = c.req.param("id")
  const sessionId = c.req.query("sessionId")
  const userId = principal.userId()

  if (!sessionId) {
    throw createError("BadRequestError", { message: "sessionId is required" })
  }

  await getAgentById(agentId)
  const thread = await getThreadById(sessionId)
  if (thread.agentId !== agentId || thread.userId !== userId) {
    throw createError("NotFoundError", { type: "Thread", id: sessionId })
  }

  const subscriber = await getSubscriber()
  if (!subscriber) {
    return c.text("Stream unavailable", 503, { "Retry-After": "3" })
  }

  const reader = subscriber.duplicate()
  const closeReader = async () => {
    try {
      await reader.disconnect()
    } catch (error) {
      console.error("Redis stream reader close failed", error)
    }
  }
  try {
    await reader.connect()
  } catch {
    return c.text("Stream unavailable", 503, { "Retry-After": "3" })
  }

  const fromSeqRaw = c.req.query("fromSeq")
  const fromSeq = fromSeqRaw ? Number(fromSeqRaw) : null
  if (fromSeqRaw && Number.isNaN(fromSeq)) {
    await closeReader()
    throw createError("BadRequestError", { message: "Invalid fromSeq" })
  }

  const key = streamKey(sessionId)
  const initialSeq = typeof thread.seq === "number" ? thread.seq : 0
  const encoder = new TextEncoder()
  const origin = c.req.header("Origin") ?? ""
  const allowedOrigins = config().app.origins
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  }
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
    headers["Access-Control-Allow-Credentials"] = "true"
  }

  const readable = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: string) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))

      write(
        "init",
        JSON.stringify({
          session: {
            id: thread.id,
            status: thread.status,
            seq: thread.seq,
          },
          lastSeq: initialSeq,
        }),
      )

      let lastId: string = "$"

      if (fromSeq !== null) {
        const startId = `${Math.max(fromSeq + 1, 0)}-0`
        const history = await reader.xRange(key, startId, "+")
        const firstSeq = history[0] ? Number(history[0].id.split("-")[0]) : null

        if (firstSeq !== null && fromSeq < firstSeq) {
          write("resync_required", "{}")
        } else if (history.length === 0 && fromSeq < initialSeq) {
          write("resync_required", "{}")
        } else {
          for (const entry of history) {
            const payload = parseEntry(sessionId, entry as StreamEntry)
            write(payload.type, JSON.stringify(payload))
          }
          lastId = history.length > 0 ? history[history.length - 1].id : `${Math.max(fromSeq, 0)}-0`
        }
      }

      if (fromSeq === null) {
        lastId = "$"
      }

      let active = true
      const heartbeat = setInterval(() => {
        if (!active) return
        write("ping", "{}")
      }, 25000)

      while (!c.req.raw.signal.aborted) {
        try {
          const results = (await reader.xRead([{ key, id: lastId }], { COUNT: 50, BLOCK: 30000 })) as Array<{
            name: string
            messages: StreamEntry[]
          }> | null

          if (!results) continue

          for (const streamResult of results) {
            for (const entry of streamResult.messages) {
              const payload = parseEntry(sessionId, entry as StreamEntry)
              write(payload.type, JSON.stringify(payload))
              lastId = entry.id
            }
          }
        } catch {
          break
        }
      }

      active = false
      clearInterval(heartbeat)
      controller.close()
      await closeReader()
    },
    async cancel() {
      await closeReader()
    },
  })

  return new Response(readable, { headers })
})
