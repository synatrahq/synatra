import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { CreateManyInvitationsSchema, createManyInvitations } from "@synatra/core"
import { requirePermission } from "../../../middleware/principal"
import { sendBulkInvitationEmails } from "../../../auth"

export const createBulk = new Hono().post(
  "/bulk",
  requirePermission("invitation", "create"),
  zValidator("json", CreateManyInvitationsSchema),
  async (c) => {
    const body = c.req.valid("json")
    const invitations = await createManyInvitations(body)
    await sendBulkInvitationEmails(invitations.map((inv) => inv.id))
    return c.json({ invitations, count: invitations.length }, 201)
  },
)
