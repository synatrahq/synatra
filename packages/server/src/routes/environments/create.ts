import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { CreateEnvironmentSchema, createEnvironment } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const create = new Hono().post(
  "/",
  requirePermission("environment", "create"),
  zValidator("json", CreateEnvironmentSchema),
  async (c) => {
    const body = c.req.valid("json")
    const environment = await createEnvironment(body)
    return c.json(environment, 201)
  },
)
