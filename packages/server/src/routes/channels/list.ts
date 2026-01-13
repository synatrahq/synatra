import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { listChannels } from "@synatra/core"

const schema = z.object({
  includeArchived: z
    .string()
    .optional()
    .transform((v) => v === "true"),
})

export const list = new Hono().get("/", zValidator("query", schema), async (c) => {
  const query = c.req.valid("query")
  const channels = await listChannels({ includeArchived: query.includeArchived })
  return c.json(channels)
})
