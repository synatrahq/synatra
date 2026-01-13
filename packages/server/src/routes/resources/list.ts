import { Hono } from "hono"
import { listResourcesWithConfigs } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"
import { toAPIResourceConfig } from "./projection"

export const list = new Hono().get("/", requirePermission("resource", "read"), async (c) => {
  const resources = await listResourcesWithConfigs()
  const results = resources.map((r) => ({
    ...r,
    configs: r.configs.map((cfg) => ({
      ...cfg,
      config: toAPIResourceConfig(r.type, cfg.config),
    })),
  }))
  return c.json(results)
})
