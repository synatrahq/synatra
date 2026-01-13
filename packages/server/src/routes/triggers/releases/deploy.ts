import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { deployTrigger, DeployTriggerSchema } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { createError } from "@synatra/util/error"

export const deploy = new Hono().post(
  "/:id/deploy",
  requirePermission("trigger", "update"),
  zValidator("json", DeployTriggerSchema.omit({ triggerId: true })),
  async (c) => {
    const triggerId = c.req.param("id")
    const body = c.req.valid("json")
    const release = await deployTrigger({ triggerId, ...body })
    if (!release) throw createError("NotFoundError", { type: "Trigger", id: triggerId })
    return c.json(release, 201)
  },
)
