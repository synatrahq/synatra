import { z } from "zod"

const schema = z.object({
  port: z.coerce.number().int().positive().default(3001),
  serviceSecret: z.string().min(1),
  pool: z.object({
    size: z.coerce.number().int().positive().default(4),
    memoryLimitMb: z.coerce.number().int().positive().default(128),
    queueLimit: z.coerce.number().int().positive().default(100),
  }),
})

type Config = z.infer<typeof schema>

let cached: Config | null = null

export function config(): Config {
  if (cached) return cached

  cached = schema.parse({
    port: process.env.PORT,
    serviceSecret: process.env.SERVICE_SECRET,
    pool: {
      size: process.env.POOL_SIZE,
      memoryLimitMb: process.env.MEMORY_LIMIT_MB,
      queueLimit: process.env.QUEUE_LIMIT,
    },
  })

  return cached
}
