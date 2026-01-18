export const SubscriptionPlan = ["free", "starter", "pro", "business"] as const
export type SubscriptionPlan = (typeof SubscriptionPlan)[number]

export const SubscriptionStatus = ["active", "cancelled", "past_due"] as const
export type SubscriptionStatus = (typeof SubscriptionStatus)[number]

export const PLAN_HIERARCHY: Record<SubscriptionPlan, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
} as const

export const PLAN_LIMITS: Record<
  SubscriptionPlan,
  {
    runLimit: number | null
    overageRate: string | null
    userLimit: number | null
    agentLimit: number | null
  }
> = {
  free: {
    runLimit: 150,
    overageRate: null,
    userLimit: 1,
    agentLimit: 2,
  },
  starter: {
    runLimit: 1000,
    overageRate: "0.08",
    userLimit: 5,
    agentLimit: 10,
  },
  pro: {
    runLimit: 2500,
    overageRate: "0.06",
    userLimit: 15,
    agentLimit: 30,
  },
  business: {
    runLimit: 6000,
    overageRate: "0.05",
    userLimit: null,
    agentLimit: null,
  },
} as const
