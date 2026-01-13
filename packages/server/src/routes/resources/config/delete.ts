import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { RemoveResourceConfigSchema, removeResourceConfig } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const del = new Hono().delete(
  "/:id/config",
  requirePermission("resource", "update"),
  zValidator("json", RemoveResourceConfigSchema.omit({ resourceId: true })),
  async (c) => {
    const resourceId = c.req.param("id")
    const deleted = await removeResourceConfig({ resourceId, ...c.req.valid("json") })
    if (!deleted) throw createError("NotFoundError", { type: "ResourceConfig", id: resourceId })
    return c.json({ id: resourceId, deleted: true })
  },
)
