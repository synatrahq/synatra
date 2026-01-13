import { z } from "zod"

const schema = z.object({
  gatewayUrl: z.url(),
  connectorToken: z.string().min(1),
  version: z.string().default("0.0.0"),
  platform: z.string(),
})

type Config = z.infer<typeof schema>

let cached: Config | null = null

export function config(): Config {
  if (cached) return cached

  cached = schema.parse({
    gatewayUrl: process.env.GATEWAY_URL,
    connectorToken: process.env.CONNECTOR_TOKEN,
    version: process.env.npm_package_version,
    platform: `${process.platform}-${process.arch}`,
  })

  return cached
}
