import { z } from "zod"

const OAuthAppSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
})

const GitHubAppSchema = z.object({
  appId: z.string().min(1),
  privateKey: z.string().min(1),
  appSlug: z.string().min(1),
  webhookSecret: z.string().min(1).optional(),
})

const PlanPricesSchema = z.object({
  license: z.string().min(1),
  overage: z.string().min(1),
})

const ConfigSchema = z.object({
  auth: z.object({
    secret: z.string().min(1),
    baseUrl: z.url(),
  }),
  app: z.object({
    port: z.number().int().positive(),
    url: z.url(),
    origins: z.array(z.url()).min(1),
    cookieDomain: z.string().optional(),
    isDevelopment: z.boolean(),
  }),
  console: z.object({
    url: z.url(),
  }),
  encryption: z.object({
    key: z.string().min(1),
  }),
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
  resend: z
    .object({
      apiKey: z.string().min(1),
      fromEmail: z.email(),
    })
    .optional(),
  google: OAuthAppSchema.optional(),
  oauth: z.object({
    intercom: OAuthAppSchema.optional(),
  }),
  github: GitHubAppSchema.optional(),
  stripe: z
    .object({
      secretKey: z.string().min(1),
      webhookSecret: z.string().min(1),
      runMeterId: z.string().min(1),
      llmMeterId: z.string().min(1),
      priceStarter: PlanPricesSchema,
      pricePro: PlanPricesSchema,
      priceBusiness: PlanPricesSchema,
    })
    .optional(),
})

type ConfigType = z.infer<typeof ConfigSchema>

let _config: ConfigType | null = null

function parseOrigins(list: string | undefined, single: string | undefined, base: string): string[] {
  const origins: string[] = []
  if (list) {
    origins.push(
      ...list
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    )
  }
  origins.push(base)
  origins.push("http://localhost:5173")
  return Array.from(new Set(origins))
}

export function config(): ConfigType {
  if (_config) return _config

  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required")

  const apiUrl = process.env.API_URL?.trim() ?? "http://localhost:8787"
  const consoleUrl = process.env.CONSOLE_URL?.trim() ?? "http://localhost:5173"

  const encryptionKey = process.env.ENCRYPTION_KEY?.trim()
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is required")

  const raw = {
    auth: {
      secret,
      baseUrl: apiUrl,
    },
    app: {
      port: Number(process.env.PORT ?? "8787"),
      url: apiUrl,
      origins: parseOrigins(process.env.APP_ORIGINS, undefined, consoleUrl),
      cookieDomain: process.env.APP_COOKIE_DOMAIN?.trim(),
      isDevelopment: process.env.NODE_ENV !== "production",
    },
    console: {
      url: consoleUrl,
    },
    encryption: {
      key: encryptionKey,
    },
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
    resend:
      process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
        ? {
            apiKey: process.env.RESEND_API_KEY.trim(),
            fromEmail: process.env.RESEND_FROM_EMAIL.trim(),
          }
        : undefined,
    google:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: process.env.GOOGLE_CLIENT_ID.trim(),
            clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
          }
        : undefined,
    oauth: {
      intercom:
        process.env.INTERCOM_CLIENT_ID && process.env.INTERCOM_CLIENT_SECRET
          ? {
              clientId: process.env.INTERCOM_CLIENT_ID.trim(),
              clientSecret: process.env.INTERCOM_CLIENT_SECRET.trim(),
            }
          : undefined,
    },
    github:
      process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY && process.env.GITHUB_APP_SLUG
        ? {
            appId: process.env.GITHUB_APP_ID.trim(),
            privateKey: process.env.GITHUB_PRIVATE_KEY,
            appSlug: process.env.GITHUB_APP_SLUG.trim(),
            webhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim(),
          }
        : undefined,
    stripe:
      process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_RUN_METER_ID &&
      process.env.STRIPE_LLM_METER_ID &&
      process.env.STRIPE_PRICE_STARTER_LICENSE &&
      process.env.STRIPE_PRICE_STARTER_OVERAGE &&
      process.env.STRIPE_PRICE_PRO_LICENSE &&
      process.env.STRIPE_PRICE_PRO_OVERAGE &&
      process.env.STRIPE_PRICE_BUSINESS_LICENSE &&
      process.env.STRIPE_PRICE_BUSINESS_OVERAGE
        ? {
            secretKey: process.env.STRIPE_SECRET_KEY.trim(),
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET.trim(),
            runMeterId: process.env.STRIPE_RUN_METER_ID.trim(),
            llmMeterId: process.env.STRIPE_LLM_METER_ID.trim(),
            priceStarter: {
              license: process.env.STRIPE_PRICE_STARTER_LICENSE.trim(),
              overage: process.env.STRIPE_PRICE_STARTER_OVERAGE.trim(),
            },
            pricePro: {
              license: process.env.STRIPE_PRICE_PRO_LICENSE.trim(),
              overage: process.env.STRIPE_PRICE_PRO_OVERAGE.trim(),
            },
            priceBusiness: {
              license: process.env.STRIPE_PRICE_BUSINESS_LICENSE.trim(),
              overage: process.env.STRIPE_PRICE_BUSINESS_OVERAGE.trim(),
            },
          }
        : undefined,
  }

  const result = ConfigSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
    throw new Error(`Invalid config: ${issues}`)
  }

  _config = result.data
  return _config
}
