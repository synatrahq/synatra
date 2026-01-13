import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { listThreads } from "@synatra/core"
import { ThreadStatus } from "@synatra/core/types"

const schema = z.object({
  status: z.enum(ThreadStatus).optional(),
  agentId: z.string().optional(),
  triggerId: z.string().optional(),
  channelId: z.string().optional(),
  archived: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
})

export const list = new Hono().get("/", zValidator("query", schema), async (c) => {
  const { status, agentId, triggerId, channelId, archived, cursor, limit } = c.req.valid("query")
  const results = await listThreads({ status, agentId, triggerId, channelId, archived, cursor, limit })
  return c.json(results)
})
