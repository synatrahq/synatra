import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { CreateResourceSchema, createResource } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const create = new Hono().post(
  "/",
  requirePermission("resource", "create"),
  zValidator("json", CreateResourceSchema),
  async (c) => {
    const resource = await createResource(c.req.valid("json"))
    return c.json(resource, 201)
  },
)
