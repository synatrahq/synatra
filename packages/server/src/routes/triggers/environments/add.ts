import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import {
  getTriggerById,
  addTriggerEnvironment,
  AddTriggerEnvironmentSchema,
  getChannelById,
  getEnvironmentById,
} from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"

export const add = new Hono().post(
  "/:id/environments/add",
  requirePermission("trigger", "update"),
  zValidator("json", AddTriggerEnvironmentSchema.omit({ triggerId: true })),
  async (c) => {
    const triggerId = c.req.param("id")
    const body = c.req.valid("json")
    await getTriggerById(triggerId)
    await getEnvironmentById(body.environmentId)
    await getChannelById(body.channelId)
    const result = await addTriggerEnvironment({ triggerId, ...body })
    return c.json(result, 201)
  },
)
