import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { UpdateEnvironmentSchema, updateEnvironment } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const update = new Hono().patch(
  "/:id",
  requirePermission("environment", "update"),
  zValidator("json", UpdateEnvironmentSchema.omit({ id: true })),
  async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const environment = await updateEnvironment({ id, ...body })
    return c.json(environment)
  },
)
