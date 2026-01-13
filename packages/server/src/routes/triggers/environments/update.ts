import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { getTriggerById, updateTriggerEnvironment, UpdateTriggerEnvironmentSchema, getChannelById } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const update = new Hono().patch(
  "/:id/environments/:environmentId",
  requirePermission("trigger", "update"),
  zValidator("json", UpdateTriggerEnvironmentSchema.omit({ triggerId: true, environmentId: true })),
  async (c) => {
    const triggerId = c.req.param("id")
    const environmentId = c.req.param("environmentId")
    const body = c.req.valid("json")
    await getTriggerById(triggerId)
    if (body.channelId) await getChannelById(body.channelId)
    const result = await updateTriggerEnvironment({ triggerId, environmentId, ...body })
    return c.json(result)
  },
)
