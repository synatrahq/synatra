import { Hono } from "hono"
import { getAppAccountById, removeAppAccount } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const del = new Hono().delete("/:id", requirePermission("trigger", "delete"), async (c) => {
  const id = c.req.param("id")
  await getAppAccountById(id)
  await removeAppAccount(id)
  return c.json({ id, deleted: true })
})
