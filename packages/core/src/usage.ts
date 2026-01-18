import { eq, and, gte } from "drizzle-orm"
import { z } from "zod"
import { principal } from "./principal"
import { withDb } from "./database"
import { UsageMonthTable } from "./schema"
import { PLAN_LIMITS, SubscriptionPlan } from "./types"
import { currentSubscription } from "./subscription"

export const CurrentUsageSchema = z.object({}).optional()

export const UsageHistorySchema = z.object({ months: z.number().min(1).max(12).optional() })

export const CheckUsageLimitSchema = z.object({ mode: z.enum(["warn", "soft", "hard"]).default("soft") })

export function yearMonthToPeriod(ym: number): { start: Date; end: Date } {
  const year = Math.floor(ym / 100)
  const month = ym % 100
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

export function currentYearMonth(): number {
  const now = new Date()
  return now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1)
}

export async function currentUsage(input?: z.input<typeof CurrentUsageSchema>) {
  CurrentUsageSchema.parse(input)
  const organizationId = principal.orgId()
  const ym = currentYearMonth()

  const [existing] = await withDb((db) =>
    db
      .select()
      .from(UsageMonthTable)
      .where(and(eq(UsageMonthTable.organizationId, organizationId), eq(UsageMonthTable.yearMonth, ym)))
      .limit(1),
  )

  if (existing) {
    const period = yearMonthToPeriod(existing.yearMonth)
    return { ...existing, periodStart: period.start, periodEnd: period.end }
  }

  const [created] = await withDb((db) =>
    db
      .insert(UsageMonthTable)
      .values({
        organizationId,
        yearMonth: ym,
        runCount: 0,
        runsUser: 0,
        runsTrigger: 0,
        runsSubagent: 0,
      })
      .onConflictDoNothing()
      .returning(),
  )

  if (created) {
    const period = yearMonthToPeriod(created.yearMonth)
    return { ...created, periodStart: period.start, periodEnd: period.end }
  }

  const [refetched] = await withDb((db) =>
    db
      .select()
      .from(UsageMonthTable)
      .where(and(eq(UsageMonthTable.organizationId, organizationId), eq(UsageMonthTable.yearMonth, ym)))
      .limit(1),
  )

  if (!refetched) throw new Error("Failed to create usage month")
  const period = yearMonthToPeriod(refetched.yearMonth)
  return { ...refetched, periodStart: period.start, periodEnd: period.end }
}

function subtractMonths(ym: number, months: number): number {
  const year = Math.floor(ym / 100)
  const month = ym % 100
  const totalMonths = year * 12 + (month - 1) - months
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = (totalMonths % 12) + 1
  return newYear * 100 + newMonth
}

export async function usageHistory(input: z.input<typeof UsageHistorySchema>) {
  const data = UsageHistorySchema.parse(input)
  const organizationId = principal.orgId()
  const months = data.months ?? 6
  const currentYm = currentYearMonth()
  const startYm = subtractMonths(currentYm, months - 1)

  const rows = await withDb((db) =>
    db
      .select()
      .from(UsageMonthTable)
      .where(and(eq(UsageMonthTable.organizationId, organizationId), gte(UsageMonthTable.yearMonth, startYm)))
      .orderBy(UsageMonthTable.yearMonth),
  )

  const periods = rows.map((row) => {
    const period = yearMonthToPeriod(row.yearMonth)
    return { ...row, periodStart: period.start, periodEnd: period.end }
  })

  return { periods }
}

export async function checkUsageLimit(input: z.input<typeof CheckUsageLimitSchema>) {
  const data = CheckUsageLimitSchema.parse(input)
  const usage = await currentUsage({})
  const sub = await currentSubscription({})
  const plan = sub.plan as SubscriptionPlan
  const { runLimit, overageRate } = PLAN_LIMITS[plan]

  if (runLimit === null) return { allowed: true, warning: false, usage }

  const pct = (usage.runCount / runLimit) * 100
  if (pct < 80) return { allowed: true, warning: false, usage }
  if (pct < 100) return { allowed: true, warning: true, usage }

  switch (data.mode) {
    case "hard":
      return { allowed: false, warning: true, usage, error: "Run limit exceeded. Upgrade your plan to continue." }
    case "soft": {
      if (plan === "free") {
        return {
          allowed: false,
          warning: true,
          usage,
          error: "Run limit exceeded. Upgrade to a paid plan to continue.",
        }
      }
      return { allowed: true, warning: true, overage: true, overageRate, usage }
    }
    default:
      return { allowed: true, warning: true, usage }
  }
}
