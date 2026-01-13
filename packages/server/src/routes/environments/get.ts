import { Hono } from "hono"
import { getEnvironmentById } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const id = c.req.param("id")
  const environment = await getEnvironmentById(id)
  return c.json(environment)
})
