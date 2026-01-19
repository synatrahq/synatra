import { z } from "zod"

const PlanPricesSchema = z.object({
  license: z.string(),
  overage: z.string(),
})

const ConfigSchema = z.object({
  database: z.object({
    url: z.url(),
  }),
  stripe: z
    .object({
      secretKey: z.string(),
      priceStarter: PlanPricesSchema.optional(),
      pricePro: PlanPricesSchema.optional(),
      priceBusiness: PlanPricesSchema.optional(),
    })
    .optional(),
})

type ConfigType = z.infer<typeof ConfigSchema>

let _config: ConfigType | null = null

export function config(): ConfigType {
  if (_config) return _config

  const raw = {
    database: {
      url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/synatra_dev",
    },
    stripe: process.env.STRIPE_SECRET_KEY
      ? {
          secretKey: process.env.STRIPE_SECRET_KEY,
          priceStarter:
            process.env.STRIPE_PRICE_STARTER_LICENSE && process.env.STRIPE_PRICE_STARTER_OVERAGE
              ? { license: process.env.STRIPE_PRICE_STARTER_LICENSE, overage: process.env.STRIPE_PRICE_STARTER_OVERAGE }
              : undefined,
          pricePro:
            process.env.STRIPE_PRICE_PRO_LICENSE && process.env.STRIPE_PRICE_PRO_OVERAGE
              ? { license: process.env.STRIPE_PRICE_PRO_LICENSE, overage: process.env.STRIPE_PRICE_PRO_OVERAGE }
              : undefined,
          priceBusiness:
            process.env.STRIPE_PRICE_BUSINESS_LICENSE && process.env.STRIPE_PRICE_BUSINESS_OVERAGE
              ? {
                  license: process.env.STRIPE_PRICE_BUSINESS_LICENSE,
                  overage: process.env.STRIPE_PRICE_BUSINESS_OVERAGE,
                }
              : undefined,
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
