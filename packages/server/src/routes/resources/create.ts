import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { CreateResourceSchema, createResource } from "@synatra/core"
import { ComingSoonResourceType } from "@synatra/core/types"
import { requirePermission } from "../../middleware/principal"
import { createError } from "@synatra/util/error"

export const create = new Hono().post(
  "/",
  requirePermission("resource", "create"),
  zValidator("json", CreateResourceSchema),
  async (c) => {
    const body = c.req.valid("json")

    if (ComingSoonResourceType.includes(body.type as (typeof ComingSoonResourceType)[number])) {
      throw createError("BadRequestError", { message: "This resource type is coming soon" })
    }

    const resource = await createResource(body)
    return c.json(resource, 201)
  },
)
