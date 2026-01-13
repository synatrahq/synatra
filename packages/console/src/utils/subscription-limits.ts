import { PLAN_LIMITS, type SubscriptionPlan } from "@synatra/core/types"
import { capitalize } from "./string"

type LimitCheckResult = {
  allowed: boolean
  current: number
  limit: number | null
  message: string
}

type LimitKey = "agentLimit" | "userLimit"

function checkResourceLimit(
  currentCount: number,
  additionalCount: number,
  plan: SubscriptionPlan,
  key: LimitKey,
  label: string,
): LimitCheckResult {
  const limit = PLAN_LIMITS[plan][key]
  if (limit === null) return { allowed: true, current: currentCount, limit: null, message: "" }

  const newTotal = currentCount + additionalCount
  const allowed = newTotal <= limit
  const message = allowed
    ? `${currentCount}/${limit} ${label} used`
    : `${capitalize(label)} limit reached (${limit}/${limit}). Upgrade to ${getNextPlan(plan, key)} for more ${label}.`

  return { allowed, current: currentCount, limit, message }
}

export function checkAgentLimit(currentCount: number, plan: SubscriptionPlan): LimitCheckResult {
  return checkResourceLimit(currentCount, 1, plan, "agentLimit", "agents")
}

export function checkUserLimit(
  currentCount: number,
  additionalCount: number,
  plan: SubscriptionPlan,
): LimitCheckResult {
  return checkResourceLimit(currentCount, additionalCount, plan, "userLimit", "users")
}

const PLANS: SubscriptionPlan[] = ["free", "starter", "pro", "business"]

function getNextPlan(current: SubscriptionPlan, key: LimitKey): string {
  const idx = PLANS.indexOf(current)
  const currentLimit = PLAN_LIMITS[current][key] ?? 0

  for (let i = idx + 1; i < PLANS.length; i++) {
    const next = PLANS[i]
    const nextLimit = PLAN_LIMITS[next][key]
    if (nextLimit === null || nextLimit > currentLimit) return capitalize(next)
  }

  return "Business"
}
