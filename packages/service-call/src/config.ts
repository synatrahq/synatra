import { z } from "zod"

export const serviceNames = ["server", "worker", "code-executor", "resource-gateway"] as const

export type ServiceName = (typeof serviceNames)[number]

const schema = z.object({
  resourceGatewayUrl: z.url().default("http://resource-gateway:3002"),
  codeExecutorUrl: z.url().default("http://code-executor:3001"),
  serviceSecret: z.string().min(32),
  serviceName: z.enum(serviceNames),
})

export type ServiceConfig = z.infer<typeof schema>

export function loadConfig(name: ServiceName): ServiceConfig {
  return schema.parse({
    resourceGatewayUrl: process.env.RESOURCE_GATEWAY_URL,
    codeExecutorUrl: process.env.CODE_EXECUTOR_URL,
    serviceSecret: process.env.SERVICE_SECRET,
    serviceName: name,
  })
}
