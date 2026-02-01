import { Hono } from "hono"
import { getAvailableModelsForProduction } from "../agents/copilot/models"

export const models = new Hono().get("/models", async (c) => {
  const prodModels = await getAvailableModelsForProduction()
  return c.json({ models: prodModels })
})
