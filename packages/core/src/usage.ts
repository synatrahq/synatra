import { eq, and, gte, sql } from "drizzle-orm"
import { z } from "zod"
import { principal } from "./principal"
import { withDb } from "./database"
import { UsagePeriodTable } from "./schema"
import { UsageRunType } from "./types"
import { currentSubscription } from "./subscription"

export const CurrentUsageSchema = z.object({}).optional()

export const RecordUsageSchema = z.object({ runType: z.enum(UsageRunType) })

export const ResetUsagePeriodSchema = z.object({ periodStart: z.date(), periodEnd: z.date() })

export const UpdateUsageCurrentPeriodLimitSchema = z.object({}).optional()

export const UsageHistorySchema = z.object({ months: z.number().min(1).max(12).optional() })

export const CheckUsageLimitSchema = z.object({ mode: z.enum(["warn", "soft", "hard"]).default("soft") })

function calendarMonth(): { start: Date; end: Date } {
  const now = new Date()
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  }
}

export async function getUsageCurrentPeriod(): Promise<{ start: Date; end: Date }> {
  const sub = await currentSubscription({}).catch(() => null)
  if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
    return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
  }
  return calendarMonth()
}

const runTypeColumns = {
  user: UsagePeriodTable.runsUser,
  trigger: UsagePeriodTable.runsTrigger,
  subagent: UsagePeriodTable.runsSubagent,
} as const

export async function currentUsage(input?: z.input<typeof CurrentUsageSchema>) {
  CurrentUsageSchema.parse(input)
  const organizationId = principal.orgId()
  const { start, end } = await getUsageCurrentPeriod()

  const [existing] = await withDb((db) =>
    db
      .select()
      .from(UsagePeriodTable)
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), eq(UsagePeriodTable.periodStart, start)))
      .limit(1),
  )
  if (existing) return existing

  const sub = await currentSubscription({})

  const [created] = await withDb((db) =>
    db
      .insert(UsagePeriodTable)
      .values({
        organizationId,
        periodStart: start,
        periodEnd: end,
        runCount: 0,
        runLimit: sub.runLimit,
        runsUser: 0,
        runsTrigger: 0,
        runsSubagent: 0,
      })
      .onConflictDoNothing()
      .returning(),
  )
  if (created) return created

  const [refetched] = await withDb((db) =>
    db
      .select()
      .from(UsagePeriodTable)
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), eq(UsagePeriodTable.periodStart, start)))
      .limit(1),
  )
  return refetched
}

export async function recordUsage(input: z.input<typeof RecordUsageSchema>) {
  const data = RecordUsageSchema.parse(input)
  const organizationId = principal.orgId()
  const { start } = await getUsageCurrentPeriod()

  await currentUsage({})

  await withDb((db) =>
    db
      .update(UsagePeriodTable)
      .set({
        runCount: sql`${UsagePeriodTable.runCount} + 1`,
        ...(data.runType === "user" ? { runsUser: sql`${UsagePeriodTable.runsUser} + 1` } : {}),
        ...(data.runType === "trigger" ? { runsTrigger: sql`${UsagePeriodTable.runsTrigger} + 1` } : {}),
        ...(data.runType === "subagent" ? { runsSubagent: sql`${UsagePeriodTable.runsSubagent} + 1` } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), eq(UsagePeriodTable.periodStart, start))),
  )
}

export async function resetUsagePeriod(input: z.input<typeof ResetUsagePeriodSchema>) {
  const data = ResetUsagePeriodSchema.parse(input)
  const organizationId = principal.orgId()
  const sub = await currentSubscription({})

  await withDb((db) =>
    db
      .insert(UsagePeriodTable)
      .values({
        organizationId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        runCount: 0,
        runLimit: sub.runLimit,
        runsUser: 0,
        runsTrigger: 0,
        runsSubagent: 0,
      })
      .onConflictDoUpdate({
        target: [UsagePeriodTable.organizationId, UsagePeriodTable.periodStart],
        set: { periodEnd: data.periodEnd, runLimit: sub.runLimit, updatedAt: new Date() },
      }),
  )
}

export async function updateUsageCurrentPeriodLimit(input?: z.input<typeof UpdateUsageCurrentPeriodLimitSchema>) {
  UpdateUsageCurrentPeriodLimitSchema.parse(input)
  const organizationId = principal.orgId()
  const { start } = await getUsageCurrentPeriod()
  const sub = await currentSubscription({})

  await withDb((db) =>
    db
      .update(UsagePeriodTable)
      .set({ runLimit: sub.runLimit, updatedAt: new Date() })
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), eq(UsagePeriodTable.periodStart, start))),
  )
}

export async function usageHistory(input: z.input<typeof UsageHistorySchema>) {
  const data = UsageHistorySchema.parse(input)
  const organizationId = principal.orgId()
  const months = data.months ?? 6
  const now = new Date()
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1))

  const periods = await withDb((db) =>
    db
      .select()
      .from(UsagePeriodTable)
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), gte(UsagePeriodTable.periodStart, startDate)))
      .orderBy(UsagePeriodTable.periodStart),
  )

  return { periods }
}

export async function checkUsageLimit(input: z.input<typeof CheckUsageLimitSchema>) {
  const data = CheckUsageLimitSchema.parse(input)
  const usage = await currentUsage({})
  if (!usage.runLimit) return { allowed: true, warning: false, usage }

  const pct = (usage.runCount / usage.runLimit) * 100
  if (pct < 80) return { allowed: true, warning: false, usage }
  if (pct < 100) return { allowed: true, warning: true, usage }

  switch (data.mode) {
    case "hard":
      return { allowed: false, warning: true, usage, error: "Run limit exceeded. Upgrade your plan to continue." }
    case "soft": {
      const sub = await currentSubscription({})
      if (sub.plan === "free") {
        return {
          allowed: false,
          warning: true,
          usage,
          error: "Run limit exceeded. Upgrade to a paid plan to continue.",
        }
      }
      return { allowed: true, warning: true, overage: true, overageRate: sub.overageRate, usage }
    }
    default:
      return { allowed: true, warning: true, usage }
  }
}
