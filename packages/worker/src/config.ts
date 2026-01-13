import { z } from "zod"

const schema = z
  .object({
    encryptionKey: z.string().min(1),
    temporal: z.object({
      address: z.string().min(1).default("localhost:7233"),
      namespace: z.string().min(1).default("default"),
      taskQueue: z.string().min(1).default("agent"),
      apiKey: z.string().min(1).optional(),
    }),
    stream: z
      .object({
        mode: z.enum(["off", "redis"]).default("off"),
        redisUrl: z.url().optional(),
      })
      .refine((value) => value.mode !== "redis" || !!value.redisUrl, {
        path: ["redisUrl"],
        message: "REDIS_URL is required when THREAD_STREAM_MODE=redis",
      }),
  })
  .transform((value) => ({
    ...value,
    stream: {
      mode: value.stream.mode,
      redisUrl: value.stream.redisUrl,
    },
  }))

type Config = z.infer<typeof schema>

let cached: Config | null = null

export function config(): Config {
  if (cached) return cached

  cached = schema.parse({
    encryptionKey: process.env.ENCRYPTION_KEY,
    temporal: {
      address: process.env.TEMPORAL_ADDRESS,
      namespace: process.env.TEMPORAL_NAMESPACE,
      taskQueue: process.env.TEMPORAL_TASK_QUEUE,
      apiKey: process.env.TEMPORAL_API_KEY,
    },
    stream: {
      mode: process.env.THREAD_STREAM_MODE as "off" | "redis" | undefined,
      redisUrl: process.env.REDIS_URL,
    },
  })

  return cached
}
