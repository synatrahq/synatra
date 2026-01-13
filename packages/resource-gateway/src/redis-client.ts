import { createClient } from "redis"
import { config } from "./config"

type RedisClient = ReturnType<typeof createClient>

let clientPromise: Promise<RedisClient | null> | null = null

function buildClient(): Promise<RedisClient | null> {
  const cfg = config()
  if (cfg.redis.mode !== "redis" || !cfg.redis.url) {
    return Promise.resolve(null)
  }

  const client = createClient({
    url: cfg.redis.url,
    socket: {
      reconnectStrategy: (retries: number) => Math.min(1000 * 2 ** retries, 10000),
    },
  })

  client.on("error", (err: Error) => {
    console.error("[Redis] Error:", err.message)
  })

  client.on("reconnecting", () => {
    console.log("[Redis] Reconnecting...")
  })

  return client
    .connect()
    .then(() => {
      console.log("[Redis] Connected")
      return client
    })
    .catch((err: Error) => {
      console.error("[Redis] Connection failed:", err.message)
      clientPromise = null
      return null
    })
}

export async function getRedis(): Promise<RedisClient | null> {
  const cfg = config()
  if (cfg.redis.mode !== "redis") return null

  if (!clientPromise) {
    clientPromise = buildClient()
  }
  return clientPromise
}

export function isRedisEnabled(): boolean {
  return config().redis.mode === "redis"
}

export async function closeRedis(): Promise<void> {
  if (!clientPromise) return
  const client = await clientPromise
  if (client) {
    await client.quit()
    console.log("[Redis] Disconnected")
  }
  clientPromise = null
}
