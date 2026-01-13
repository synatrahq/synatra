import { Hono } from "hono"
import { getManagedResourceWithConfigs } from "@synatra/core"
import type { ManagedResourceType } from "@synatra/core/types"
import { requirePermission } from "../../middleware/principal"
import { toAPIResourceConfig } from "./projection"

export const getManaged = new Hono().get("/managed/:type", requirePermission("resource", "read"), async (c) => {
  const type = c.req.param("type") as ManagedResourceType
  const resource = await getManagedResourceWithConfigs(type)
  if (!resource) {
    return c.json(null)
  }
  return c.json({
    ...resource,
    configs: resource.configs.map((cfg) => ({
      ...cfg,
      config: toAPIResourceConfig(resource.type, cfg.config),
    })),
  })
})
