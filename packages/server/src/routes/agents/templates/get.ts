import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getAgentTemplateById } from "@synatra/core"
import { createError } from "@synatra/util/error"

const idSchema = z.object({
  id: z.uuid(),
})

export const get = new Hono().get("/:id", zValidator("param", idSchema), async (c) => {
  const params = c.req.valid("param")
  const template = await getAgentTemplateById(params.id)
  if (!template) throw createError("NotFoundError", { type: "AgentTemplate", id: params.id })
  return c.json({ template })
})
