import { Hono } from "hono"
import { getResourceByIdWithConfigs } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"
import { toAPIResourceConfig } from "./projection"

export const get = new Hono().get("/:id", requirePermission("resource", "read"), async (c) => {
  const id = c.req.param("id")
  const resource = await getResourceByIdWithConfigs(id)
  return c.json({
    ...resource,
    configs: resource.configs.map((cfg) => ({
      ...cfg,
      config: toAPIResourceConfig(resource.type, cfg.config),
    })),
  })
})
