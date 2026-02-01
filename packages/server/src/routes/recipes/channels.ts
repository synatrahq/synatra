import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  addRecipeToChannel,
  AddRecipeToChannelSchema,
  removeRecipeFromChannel,
  RemoveRecipeFromChannelSchema,
  listRecipeChannels,
} from "@synatra/core"

export const channels = new Hono()
  .get("/:id/channels", async (c) => {
    const recipeId = c.req.param("id")
    const channels = await listRecipeChannels(recipeId)
    return c.json({ channels })
  })
  .post("/:id/channels", zValidator("json", z.object({ channelId: z.string() })), async (c) => {
    const recipeId = c.req.param("id")
    const { channelId } = c.req.valid("json")
    const channelRecipe = await addRecipeToChannel({ recipeId, channelId })
    return c.json(channelRecipe, 201)
  })
  .delete("/:id/channels/:channelId", async (c) => {
    const recipeId = c.req.param("id")
    const channelId = c.req.param("channelId")
    const deleted = await removeRecipeFromChannel({ recipeId, channelId })
    return c.json({ id: deleted?.id, deleted: !!deleted })
  })
