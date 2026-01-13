import { z } from "zod"
import { count, eq, and } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, withTx } from "./database"
import { currentSubscription } from "./subscription"
import { PLAN_LIMITS, type SubscriptionPlan } from "./types/subscription"
import { createError } from "@synatra/util/error"
import { AgentTable } from "./schema/agent.sql"
import { MemberTable } from "./schema/member.sql"
import { InvitationTable } from "./schema/invitation.sql"
import { OrganizationTable } from "./schema/organization.sql"

export const CheckAgentLimitSchema = z.number().optional()
export const CheckUserLimitSchema = z.number().optional()

async function countRows(table: typeof AgentTable | typeof MemberTable): Promise<number> {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({ count: count() })
      .from(table)
      .where(eq(table.organizationId, organizationId))
      .then((rows) => Number(rows[0]?.count ?? 0)),
  )
}

async function countPendingInvitations(): Promise<number> {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({ count: count() })
      .from(InvitationTable)
      .where(and(eq(InvitationTable.organizationId, organizationId), eq(InvitationTable.status, "pending")))
      .then((rows) => Number(rows[0]?.count ?? 0)),
  )
}

async function getPlanLimits(): Promise<{
  plan: string
  limits: (typeof PLAN_LIMITS)[SubscriptionPlan]
}> {
  const sub = await currentSubscription({})
  return {
    plan: sub.plan,
    limits: PLAN_LIMITS[sub.plan as SubscriptionPlan],
  }
}

export async function checkAgentLimit(input?: z.input<typeof CheckAgentLimitSchema>): Promise<void> {
  const additionalCount = CheckAgentLimitSchema.parse(input) ?? 1
  const { plan, limits } = await getPlanLimits()
  if (limits.agentLimit === null) return

  const current = await countRows(AgentTable)
  if (current + additionalCount > limits.agentLimit) {
    throw createError("ResourceLimitError", { resource: "agents", limit: limits.agentLimit, plan })
  }
}

export async function checkUserLimit(input?: z.input<typeof CheckUserLimitSchema>): Promise<void> {
  const additionalCount = CheckUserLimitSchema.parse(input) ?? 0
  await withTx(async (db) => {
    const { plan, limits } = await getPlanLimits()
    if (limits.userLimit === null) return

    const organizationId = principal.orgId()
    await db.select().from(OrganizationTable).where(eq(OrganizationTable.id, organizationId)).for("update")

    const [members, invitations] = await Promise.all([countRows(MemberTable), countPendingInvitations()])

    if (members + invitations + additionalCount > limits.userLimit) {
      throw createError("ResourceLimitError", { resource: "users", limit: limits.userLimit, plan })
    }
  })
}
