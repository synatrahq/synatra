import { Hono } from "hono"
import { principal, regenerateConnectorToken } from "@synatra/core"
import { loadConfig, createResourceGateway } from "@synatra/service-call"
import { requirePermission } from "../../middleware/principal"
import { createError } from "@synatra/util/error"

const serviceConfig = loadConfig("server")
const gateway = createResourceGateway(serviceConfig)

export const regenerateToken = new Hono().post(
  "/:id/regenerate-token",
  requirePermission("connector", "create"),
  async (c) => {
    const id = c.req.param("id")
    const result = await regenerateConnectorToken(id)
    if (!result) {
      throw createError("NotFoundError", { type: "Connector", id })
    }
    const organizationId = principal.orgId()
    const invalidateResult = await gateway.invalidateConnectorToken(organizationId, id)
    const invalidationFailed = !invalidateResult.ok
    if (invalidationFailed) {
      console.warn(`[Connector] Failed to invalidate token for ${id}: ${invalidateResult.error}`)
    }
    return c.json({
      connector: {
        id: result.connector.id,
        name: result.connector.name,
        status: result.connector.status,
        createdAt: result.connector.createdAt,
      },
      token: result.token,
      warning: invalidationFailed
        ? "Token regenerated but old connections may remain active until next heartbeat"
        : undefined,
    })
  },
)
