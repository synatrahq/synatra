import { Hono } from "hono"
import { listAppAccounts, type AppAccountMetadata } from "@synatra/core"

export const list = new Hono().get("/", async (c) => {
  const accounts = await listAppAccounts()
  return c.json(
    accounts.map((acc) => ({
      id: acc.id,
      appId: acc.appId,
      name: acc.name,
      metadata: acc.metadata as AppAccountMetadata | null,
      createdAt: acc.createdAt,
    })),
  )
})
