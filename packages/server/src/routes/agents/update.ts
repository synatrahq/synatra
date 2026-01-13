import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { updateAgent, UpdateAgentSchema } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"
import { createError } from "@synatra/util/error"

export const update = new Hono().patch(
  "/:id",
  requirePermission("agent", "update"),
  zValidator("json", UpdateAgentSchema.omit({ id: true })),
  async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const agent = await updateAgent({ id, ...body })
    if (!agent) throw createError("NotFoundError", { type: "Agent", id })
    return c.json(agent)
  },
)
