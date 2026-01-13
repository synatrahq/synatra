import { z } from "zod"

const ConfigSchema = z.object({
  database: z.object({
    url: z.url(),
  }),
  stripe: z
    .object({
      secretKey: z.string(),
      priceStarter: z.string().optional(),
      pricePro: z.string().optional(),
      priceBusiness: z.string().optional(),
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
          priceStarter: process.env.STRIPE_PRICE_STARTER,
          pricePro: process.env.STRIPE_PRICE_PRO,
          priceBusiness: process.env.STRIPE_PRICE_BUSINESS,
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
