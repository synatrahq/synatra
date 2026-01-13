import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { UpsertResourceConfigSchema, upsertResourceConfig } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const upsert = new Hono().post(
  "/:id/config",
  requirePermission("resource", "update"),
  zValidator("json", UpsertResourceConfigSchema.omit({ resourceId: true })),
  async (c) => {
    const result = await upsertResourceConfig({ resourceId: c.req.param("id"), ...c.req.valid("json") })
    return c.json(result)
  },
)
