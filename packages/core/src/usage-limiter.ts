import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"
import { principal } from "./principal"
import { withDb, withTx } from "./database"
import { UsagePeriodTable } from "./schema"
import { UsageRunType } from "./types"
import { currentSubscription } from "./subscription"
import { currentUsage, getUsageCurrentPeriod } from "./usage"

export interface CheckAndIncrementResult {
  allowed: boolean
  current: number
  limit: number | null
  error?: string
  overage?: boolean
  overageRate?: string | null
}

export const CheckAndIncrementRunUsageLimiterSchema = z.object({
  runType: z.enum(UsageRunType),
  mode: z.enum(["soft", "hard"]).default("soft"),
})

export const DecrementRunUsageLimiterSchema = z.object({ runType: z.enum(UsageRunType) })

export async function checkAndIncrementRunUsageLimiter(
  input: z.input<typeof CheckAndIncrementRunUsageLimiterSchema>,
): Promise<CheckAndIncrementResult> {
  const data = CheckAndIncrementRunUsageLimiterSchema.parse(input)
  const organizationId = principal.orgId()
  const { start } = await getUsageCurrentPeriod()

  return withTx(async (db) => {
    await currentUsage({})

    const [locked] = await db
      .select()
      .from(UsagePeriodTable)
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), eq(UsagePeriodTable.periodStart, start)))
      .for("update")
      .limit(1)

    if (!locked) throw new Error("Usage period not found")

    const withinLimit = locked.runLimit === null || locked.runCount < locked.runLimit

    let sub: Awaited<ReturnType<typeof currentSubscription>> | null = null

    if (!withinLimit) {
      if (data.mode === "hard") {
        return {
          allowed: false,
          current: locked.runCount,
          limit: locked.runLimit,
          error: "Run limit exceeded. Upgrade your plan to continue.",
        }
      }

      sub = await currentSubscription({})
      if (sub.plan === "free") {
        return {
          allowed: false,
          current: locked.runCount,
          limit: locked.runLimit,
          error: "Run limit exceeded. Upgrade to a paid plan to continue.",
        }
      }
    }

    const [result] = await db
      .update(UsagePeriodTable)
      .set({
        runCount: sql`${UsagePeriodTable.runCount} + 1`,
        ...(data.runType === "user" ? { runsUser: sql`${UsagePeriodTable.runsUser} + 1` } : {}),
        ...(data.runType === "trigger" ? { runsTrigger: sql`${UsagePeriodTable.runsTrigger} + 1` } : {}),
        ...(data.runType === "subagent" ? { runsSubagent: sql`${UsagePeriodTable.runsSubagent} + 1` } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), eq(UsagePeriodTable.periodStart, start)))
      .returning()

    if (!result) throw new Error("Failed to increment run count")

    if (sub) {
      return {
        allowed: true,
        current: result.runCount,
        limit: result.runLimit,
        overage: true,
        overageRate: sub.overageRate,
      }
    }

    return { allowed: true, current: result.runCount, limit: result.runLimit }
  })
}

export async function decrementRunUsageLimiter(input: z.input<typeof DecrementRunUsageLimiterSchema>) {
  const data = DecrementRunUsageLimiterSchema.parse(input)
  const organizationId = principal.orgId()
  const { start } = await getUsageCurrentPeriod()

  await withDb((db) =>
    db
      .update(UsagePeriodTable)
      .set({
        runCount: sql`GREATEST(0, ${UsagePeriodTable.runCount} - 1)`,
        ...(data.runType === "user" ? { runsUser: sql`GREATEST(0, ${UsagePeriodTable.runsUser} - 1)` } : {}),
        ...(data.runType === "trigger" ? { runsTrigger: sql`GREATEST(0, ${UsagePeriodTable.runsTrigger} - 1)` } : {}),
        ...(data.runType === "subagent"
          ? { runsSubagent: sql`GREATEST(0, ${UsagePeriodTable.runsSubagent} - 1)` }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(UsagePeriodTable.organizationId, organizationId), eq(UsagePeriodTable.periodStart, start))),
  )
}
