import { Hono } from "hono"
import { listConnectors } from "@synatra/core"

export const list = new Hono().get("/", async (c) => {
  const connectors = await listConnectors()
  return c.json(
    connectors.map((conn) => ({
      id: conn.id,
      name: conn.name,
      status: conn.status,
      lastSeenAt: conn.lastSeenAt,
      metadata: conn.metadata,
      createdAt: conn.createdAt,
    })),
  )
})
