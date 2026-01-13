import { randomUUID } from "crypto"
import { z } from "zod"

const redisSchema = z
  .object({
    mode: z.enum(["off", "redis"]).default("off"),
    url: z.url().optional(),
  })
  .refine((v) => v.mode !== "redis" || !!v.url, {
    path: ["url"],
    message: "REDIS_URL required when REDIS_MODE=redis",
  })

const poolSchema = z.object({
  maxPools: z.coerce.number().int().positive().default(50),
  idleTtlMs: z.coerce.number().int().positive().default(300000),
})

const envSchema = z
  .object({
    encryptionKey: z.string().min(1),
    serviceSecret: z.string().min(1),
    port: z.coerce.number().int().positive().default(10000),
    internalPort: z.coerce.number().int().positive().default(3000),
    instanceId: z.string().min(1),
    redis: redisSchema,
    pool: poolSchema,
    github: z
      .object({
        appId: z.string().min(1),
        privateKey: z.string().min(1),
      })
      .optional(),
  })
  .transform((value) => ({
    ...value,
    github: value.github ?? null,
  }))

type GatewayEnv = z.infer<typeof envSchema>

let envCached: GatewayEnv | null = null

export function config(): GatewayEnv {
  if (envCached) return envCached

  envCached = envSchema.parse({
    encryptionKey: process.env.ENCRYPTION_KEY?.trim(),
    serviceSecret: process.env.SERVICE_SECRET?.trim(),
    port: process.env.PORT,
    internalPort: process.env.INTERNAL_PORT,
    instanceId: process.env.INSTANCE_ID?.trim() || randomUUID(),
    redis: {
      mode: process.env.REDIS_MODE as "off" | "redis" | undefined,
      url: process.env.REDIS_URL?.trim(),
    },
    pool: {
      maxPools: process.env.POOL_MAX_COUNT,
      idleTtlMs: process.env.POOL_IDLE_TTL_MS,
    },
    github:
      process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY
        ? {
            appId: process.env.GITHUB_APP_ID.trim(),
            privateKey: process.env.GITHUB_PRIVATE_KEY,
          }
        : undefined,
  })

  return envCached
}
