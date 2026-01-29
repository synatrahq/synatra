import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { listRecipes, getRecipeStepCount } from "@synatra/core"

const schema = z.object({
  agentId: z.string().optional(),
  channelId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
})

export const list = new Hono().get("/", zValidator("query", schema), async (c) => {
  const query = c.req.valid("query")
  const result = await listRecipes(query)

  const releaseIds = result.items.map((r) => r.currentReleaseId).filter((id): id is string => !!id)
  const stepCounts = releaseIds.length > 0 ? await getRecipeStepCount(releaseIds) : new Map<string, number>()

  return c.json({
    ...result,
    items: result.items.map((r) => ({
      ...r,
      stepCount: r.currentReleaseId ? (stepCounts.get(r.currentReleaseId) ?? 0) : 0,
    })),
  })
})
