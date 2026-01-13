import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getResourceById, getResourceConfig, principal } from "@synatra/core"
import { loadConfig, createResourceGateway } from "@synatra/service-call"
import {
  UserConfigurableResourceType,
  type UserConfigurableResourceType as UserConfigurableResourceTypeType,
  type ResourceConfigValue,
} from "@synatra/core/types"
import { requirePermission } from "../../middleware/principal"

const serviceConfig = loadConfig("server")
const gateway = createResourceGateway(serviceConfig)

const SENSITIVE_FIELDS: Record<UserConfigurableResourceTypeType, readonly string[]> = {
  postgres: ["password", "caCertificate", "clientCertificate", "clientKey"],
  mysql: ["password", "caCertificate", "clientCertificate", "clientKey"],
  stripe: ["apiKey"],
  github: ["cachedToken"],
  intercom: [],
  restapi: ["auth"],
}

const schema = z.object({
  type: z.enum(UserConfigurableResourceType),
  config: z.record(z.string(), z.unknown()),
  resourceId: z.string().optional(),
  environmentId: z.string().optional(),
  connectionMode: z.enum(["direct", "connector"]).optional(),
  connectorId: z.string().nullable().optional(),
})

export const testConnection = new Hono().post(
  "/test-connection",
  requirePermission("resource", "read"),
  zValidator("json", schema),
  async (c) => {
    const { type, config, resourceId, environmentId, connectionMode, connectorId } = c.req.valid("json")

    let finalConfig = config

    if (resourceId && environmentId) {
      const resource = await getResourceById(resourceId)
      if (resource && resource.organizationId === principal.orgId()) {
        const existing = await getResourceConfig({ resourceId, environmentId })
        if (existing) {
          finalConfig = mergeSensitiveFields(type, config, existing.config)
        }
      }
    }

    const organizationId = principal.orgId()
    const result = await gateway.testConnection(organizationId, {
      type,
      config: finalConfig,
      connectionMode,
      connectorId,
    })

    if (!result.ok) {
      return c.json({ success: false, error: result.error })
    }

    return c.json(result.data)
  },
)

function mergeSensitiveFields(
  type: UserConfigurableResourceTypeType,
  input: Record<string, unknown>,
  existing: ResourceConfigValue,
): Record<string, unknown> {
  const result = { ...input }
  const sensitiveFields = SENSITIVE_FIELDS[type]

  for (const field of sensitiveFields) {
    if (result[field] === undefined || result[field] === "") {
      const existingValue = (existing as Record<string, unknown>)[field]
      if (existingValue) {
        result[field] = existingValue
      }
    }
  }

  return result
}
