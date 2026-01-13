import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { UpdateResourceSchema, updateResource } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const update = new Hono().patch(
  "/:id",
  requirePermission("resource", "update"),
  zValidator("json", UpdateResourceSchema.omit({ id: true })),
  async (c) => {
    const resource = await updateResource({ id: c.req.param("id"), ...c.req.valid("json") })
    return c.json(resource)
  },
)
