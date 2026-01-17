import { Show, For } from "solid-js"
import { Button, Skeleton } from "../../ui"
import { CreditCard, Check, Lightning, X, Calendar } from "phosphor-solid-js"
import type { SubscriptionCurrent } from "../../app/api"
import { PLAN_HIERARCHY, PLAN_LIMITS, type SubscriptionPlan } from "@synatra/core/types"

type BillingListProps = {
  subscription: SubscriptionCurrent | null
  loading?: boolean
  onPlanChangeRequest: (plan: string) => void
  changingPlan?: boolean
  onCancelScheduleRequest: () => void
  cancellingSchedule?: boolean
  onManageBilling: () => void
  managingBilling?: boolean
}

type PlanConfig = {
  id: SubscriptionPlan
  name: string
  price: number
  popular?: boolean
  description: string
  targetAudience: string
}

const planConfigs: PlanConfig[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "For individuals exploring AI automation",
    targetAudience: "Personal projects & evaluation",
  },
  {
    id: "starter",
    name: "Starter",
    price: 49,
    popular: true,
    description: "For small teams getting started with automation",
    targetAudience: "Startups & small teams (2-5 people)",
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    description: "For growing teams with advanced integration needs",
    targetAudience: "Growing teams (6-15 people)",
  },
  {
    id: "business",
    name: "Business",
    price: 299,
    description: "For large teams requiring enterprise features",
    targetAudience: "Large teams & enterprise (15+ people)",
  },
]

const PLAN_HIGHLIGHTS: Record<SubscriptionPlan, [string, string]> = {
  free: ["1 user, 2 agents", "All features included"],
  starter: ["5 users, 10 agents", "All features included"],
  pro: ["15 users, 30 agents", "All features included"],
  business: ["Unlimited users & agents", "All features included"],
}

function getPlanFeatures(config: PlanConfig): string[] {
  const limits = PLAN_LIMITS[config.id]
  const base = [`${limits.runLimit.toLocaleString()} runs/month`]
  if (limits.overageRate) base.push(`$${limits.overageRate} overage`)
  return [...base, ...PLAN_HIGHLIGHTS[config.id]]
}

function BillingSkeleton() {
  return (
    <div class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <Skeleton class="h-4 w-32" />
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <For each={[1, 2, 3, 4]}>
          {() => (
            <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-elevated p-4">
              <Skeleton class="h-5 w-20" />
              <Skeleton class="h-8 w-24" />
              <Skeleton class="h-10 w-full" />
              <div class="flex flex-col gap-2">
                <Skeleton class="h-3 w-full" />
                <Skeleton class="h-3 w-full" />
                <Skeleton class="h-3 w-3/4" />
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function CurrentSubscriptionBadge(props: {
  subscription: SubscriptionCurrent
  onCancelSchedule: () => void
  cancellingSchedule?: boolean
  onManageBilling: () => void
  managingBilling?: boolean
}) {
  const scheduledDate = () =>
    props.subscription.scheduledAt &&
    new Date(props.subscription.scheduledAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  const cancelDate = () =>
    props.subscription.cancelAt &&
    new Date(props.subscription.cancelAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  return (
    <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-3">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <CreditCard class="h-4 w-4 text-accent" weight="duotone" />
            <span class="text-xs font-medium text-text-muted">Current plan</span>
          </div>
          <div class="mt-2">
            <span class="text-[15px] font-semibold capitalize text-text">{props.subscription.plan}</span>
          </div>
        </div>
        <Show when={props.subscription.stripeCustomerId}>
          <Button variant="outline" size="sm" onClick={props.onManageBilling} disabled={props.managingBilling}>
            <CreditCard class="h-3 w-3" weight="duotone" />
            {props.managingBilling ? "Opening..." : "Payment methods"}
          </Button>
        </Show>
      </div>

      <div class="flex flex-wrap gap-4">
        <Show when={props.subscription.runLimit}>
          <div class="flex items-center gap-2">
            <Lightning class="h-3.5 w-3.5 text-accent" weight="duotone" />
            <div class="flex flex-col">
              <span class="text-xs font-medium text-text">{props.subscription.runLimit?.toLocaleString()} runs</span>
              <span class="text-2xs text-text-muted">per month</span>
            </div>
          </div>
        </Show>
        <Show when={props.subscription.overageRate}>
          <div class="flex items-center gap-2">
            <div class="h-1 w-1 rounded-full bg-border"></div>
            <div class="flex flex-col">
              <span class="text-xs font-medium text-text">${props.subscription.overageRate}/run</span>
              <span class="text-2xs text-text-muted">overage rate</span>
            </div>
          </div>
        </Show>
      </div>

      <Show when={props.subscription.scheduledPlan && scheduledDate()}>
        <div class="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
          <div class="flex items-start gap-2 flex-1">
            <Calendar class="h-3.5 w-3.5 shrink-0 text-warning" weight="duotone" />
            <p class="text-2xs text-warning leading-relaxed">
              Scheduled to change to <span class="font-semibold capitalize">{props.subscription.scheduledPlan}</span> on{" "}
              {scheduledDate()}
            </p>
          </div>
          <button
            onClick={props.onCancelSchedule}
            disabled={props.cancellingSchedule}
            class="flex shrink-0 items-center gap-1 rounded-md border border-warning/20 bg-warning/5 px-2 py-1 text-2xs font-medium text-warning transition-all hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Show when={!props.cancellingSchedule}>
              <X class="h-3 w-3" weight="bold" />
            </Show>
            {props.cancellingSchedule ? "Cancelling..." : "Cancel"}
          </button>
        </div>
      </Show>

      <Show when={cancelDate()}>
        <div class="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5">
          <div class="flex items-start gap-2 flex-1">
            <Calendar class="h-3.5 w-3.5 shrink-0 text-danger" weight="duotone" />
            <p class="text-2xs text-danger leading-relaxed">
              Subscription will be cancelled on <span class="font-semibold">{cancelDate()}</span>. Visit billing portal
              to undo.
            </p>
          </div>
        </div>
      </Show>
    </div>
  )
}

function CancelledSubscriptionMessage(props: { onManageBilling: () => void }) {
  return (
    <div class="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-3">
      <div class="flex items-start gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/20">
          <X class="h-4 w-4 text-danger" weight="bold" />
        </div>
        <div class="flex-1">
          <p class="text-xs font-semibold text-danger">Subscription cancelled</p>
          <p class="mt-1 text-2xs leading-relaxed text-text-muted">
            Your subscription has been cancelled. To change plans or reactivate, please visit the billing portal.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={props.onManageBilling}
            class="mt-3 border-danger/20 text-danger hover:bg-danger/10"
          >
            Open billing portal
          </Button>
        </div>
      </div>
    </div>
  )
}

type PlanCardProps = {
  config: PlanConfig
  current: boolean
  currentPlanId: string
  onChangePlan: () => void
  changingPlan: boolean
  hasSchedule: boolean
  hasCancelScheduled: boolean
  isCancelled: boolean
  onManageBilling: () => void
  managingBilling: boolean
}

function PlanCard(props: PlanCardProps) {
  const isUpgrade = () => PLAN_HIERARCHY[props.config.id] > PLAN_HIERARCHY[props.currentPlanId as SubscriptionPlan]
  const isFreeDowngrade = () => props.config.id === "free" && props.currentPlanId !== "free"
  const features = () => getPlanFeatures(props.config)

  function label(): string {
    if (props.current) return "Current plan"
    if (isFreeDowngrade()) return "Cancel subscription"
    if (isUpgrade()) return "Upgrade"
    return "Downgrade"
  }

  function handleClick() {
    if (isFreeDowngrade()) {
      props.onManageBilling()
    } else {
      props.onChangePlan()
    }
  }

  function isDisabled(): boolean {
    if (props.current || props.isCancelled || props.hasSchedule || props.hasCancelScheduled) return true
    if (isFreeDowngrade()) return props.managingBilling
    return props.changingPlan
  }

  return (
    <div
      class="relative flex flex-col gap-3 rounded-lg border bg-surface-elevated px-3 py-3 transition-all"
      classList={{
        "border-accent/50": props.config.popular && !props.current,
        "border-accent": props.current,
        "border-border hover:border-accent/20": !props.config.popular && !props.current,
      }}
    >
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-[15px] font-semibold text-text">{props.config.name}</h3>
          </div>
          <p class="mt-1 text-2xs text-text-muted">{props.config.description}</p>
        </div>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-lg font-bold text-text">${props.config.price}</span>
        <span class="text-xs text-text-muted">/month</span>
      </div>
      <p class="text-2xs text-text-secondary">{props.config.targetAudience}</p>
      <button
        onClick={handleClick}
        disabled={isDisabled()}
        class="flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
        classList={{
          "bg-accent text-white hover:bg-accent/90": !props.current && isUpgrade(),
          "bg-surface-muted text-text hover:bg-surface-strong": !props.current && !isUpgrade(),
          "bg-surface-muted text-text-muted": props.current,
        }}
      >
        <Show when={props.changingPlan && !isFreeDowngrade()}>
          <Lightning class="h-3 w-3 animate-pulse" weight="duotone" />
        </Show>
        {props.managingBilling && isFreeDowngrade() ? "Opening..." : label()}
      </button>
      <div class="flex flex-col gap-1.5 border-t border-border pt-3">
        <For each={features()}>
          {(feature) => (
            <div class="flex items-start gap-2 text-2xs text-text-muted">
              <Check class="h-3 w-3 shrink-0 text-success" weight="bold" />
              <span>{feature}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export function BillingList(props: BillingListProps) {
  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="flex items-center px-3 py-2">
        <h1 class="text-xs font-medium text-text">Billing</h1>
      </div>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={props.loading}>
          <BillingSkeleton />
        </Show>

        <Show when={!props.loading && props.subscription}>
          {(sub) => (
            <div class="flex flex-col gap-4 px-3 pb-3">
              <CurrentSubscriptionBadge
                subscription={sub()}
                onCancelSchedule={props.onCancelScheduleRequest}
                cancellingSchedule={props.cancellingSchedule}
                onManageBilling={props.onManageBilling}
                managingBilling={props.managingBilling}
              />

              <Show when={sub().status === "cancelled"}>
                <CancelledSubscriptionMessage onManageBilling={props.onManageBilling} />
              </Show>

              <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-3">
                <h2 class="text-xs font-medium text-text">Choose your plan</h2>
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <For each={planConfigs}>
                    {(config) => (
                      <PlanCard
                        config={config}
                        current={sub().plan === config.id}
                        currentPlanId={sub().plan}
                        onChangePlan={() => props.onPlanChangeRequest(config.id)}
                        changingPlan={props.changingPlan || false}
                        hasSchedule={!!sub().scheduledPlan}
                        hasCancelScheduled={!!sub().cancelAt}
                        isCancelled={sub().status === "cancelled"}
                        onManageBilling={props.onManageBilling}
                        managingBilling={props.managingBilling || false}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
