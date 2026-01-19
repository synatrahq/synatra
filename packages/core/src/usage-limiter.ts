import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"
import { principal } from "./principal"
import { withDb, withTx } from "./database"
import { UsageMonthTable } from "./schema"
import { UsageRunType, PLAN_LIMITS, SubscriptionPlan } from "./types"
import { currentSubscription } from "./subscription"
import { currentUsage } from "./usage"

export interface CheckAndIncrementResult {
  allowed: boolean
  current: number
  limit: number | null
  yearMonth: number
  error?: string
  overage?: boolean
  overageRate?: string | null
}

export const CheckAndIncrementRunUsageLimiterSchema = z.object({
  runType: z.enum(UsageRunType),
  mode: z.enum(["soft", "hard"]).default("soft"),
})

export const DecrementRunUsageLimiterSchema = z.object({
  runType: z.enum(UsageRunType),
  yearMonth: z.number(),
})

export async function checkAndIncrementRunUsageLimiter(
  input: z.input<typeof CheckAndIncrementRunUsageLimiterSchema>,
): Promise<CheckAndIncrementResult> {
  const data = CheckAndIncrementRunUsageLimiterSchema.parse(input)
  const organizationId = principal.orgId()
  const usage = await currentUsage({})
  const ym = usage.yearMonth

  return withTx(async (db) => {
    const [locked] = await db
      .select()
      .from(UsageMonthTable)
      .where(and(eq(UsageMonthTable.organizationId, organizationId), eq(UsageMonthTable.yearMonth, ym)))
      .for("update")
      .limit(1)

    if (!locked) throw new Error("Usage month not found")

    const sub = await currentSubscription({})
    const plan = sub.plan as SubscriptionPlan
    const { runLimit, overageRate } = PLAN_LIMITS[plan]

    const withinLimit = runLimit === null || locked.runCount < runLimit

    if (!withinLimit) {
      if (data.mode === "hard") {
        return {
          allowed: false,
          current: locked.runCount,
          limit: runLimit,
          yearMonth: ym,
          error: "Run limit exceeded. Upgrade your plan to continue.",
        }
      }

      if (plan === "free") {
        return {
          allowed: false,
          current: locked.runCount,
          limit: runLimit,
          yearMonth: ym,
          error: "Run limit exceeded. Upgrade to a paid plan to continue.",
        }
      }
    }

    const [result] = await db
      .update(UsageMonthTable)
      .set({
        runCount: sql`${UsageMonthTable.runCount} + 1`,
        ...(data.runType === "user" ? { runsUser: sql`${UsageMonthTable.runsUser} + 1` } : {}),
        ...(data.runType === "trigger" ? { runsTrigger: sql`${UsageMonthTable.runsTrigger} + 1` } : {}),
        ...(data.runType === "subagent" ? { runsSubagent: sql`${UsageMonthTable.runsSubagent} + 1` } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(UsageMonthTable.organizationId, organizationId), eq(UsageMonthTable.yearMonth, ym)))
      .returning()

    if (!result) throw new Error("Failed to increment run count")

    if (!withinLimit) {
      return {
        allowed: true,
        current: result.runCount,
        limit: runLimit,
        yearMonth: ym,
        overage: true,
        overageRate,
      }
    }

    return { allowed: true, current: result.runCount, limit: runLimit, yearMonth: ym }
  })
}

export async function decrementRunUsageLimiter(input: z.input<typeof DecrementRunUsageLimiterSchema>) {
  const data = DecrementRunUsageLimiterSchema.parse(input)
  const organizationId = principal.orgId()

  await withDb((db) =>
    db
      .update(UsageMonthTable)
      .set({
        runCount: sql`GREATEST(0, ${UsageMonthTable.runCount} - 1)`,
        ...(data.runType === "user" ? { runsUser: sql`GREATEST(0, ${UsageMonthTable.runsUser} - 1)` } : {}),
        ...(data.runType === "trigger" ? { runsTrigger: sql`GREATEST(0, ${UsageMonthTable.runsTrigger} - 1)` } : {}),
        ...(data.runType === "subagent" ? { runsSubagent: sql`GREATEST(0, ${UsageMonthTable.runsSubagent} - 1)` } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(UsageMonthTable.organizationId, organizationId), eq(UsageMonthTable.yearMonth, data.yearMonth))),
  )
}
