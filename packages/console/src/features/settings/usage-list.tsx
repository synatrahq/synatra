import { For, Show, createMemo, type JSX } from "solid-js"
import { Skeleton } from "../../ui"
import { SettingsHeader } from "./settings-header"
import { ChartBar, User, Lightning, Robot, Warning } from "phosphor-solid-js"
import type { UsageCurrent, UsagePeriod, SubscriptionCurrent } from "../../app/api"
import { PLAN_LIMITS, type SubscriptionPlan } from "@synatra/core/types"

function getPlanLimits(plan: SubscriptionPlan) {
  return PLAN_LIMITS[plan]
}

type UsageListProps = {
  current: UsageCurrent | null
  history: UsagePeriod[]
  subscription: SubscriptionCurrent | null
  loading?: boolean
}

function formatPeriod(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" })
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function StatCard(props: { label: string; value: number; icon?: JSX.Element }) {
  return (
    <div class="flex flex-col gap-1 rounded-lg border border-border bg-surface-elevated p-3">
      <div class="flex items-center gap-1.5">
        <Show when={props.icon}>{props.icon}</Show>
        <span class="text-2xs text-text-muted">{props.label}</span>
      </div>
      <span class="text-lg font-semibold text-text">{formatNumber(props.value)}</span>
    </div>
  )
}

function ProgressBar(props: { used: number; limit: number }) {
  const pct = createMemo(() => Math.min((props.used / props.limit) * 100, 100))
  const atLimit = createMemo(() => pct() >= 100)
  const nearLimit = createMemo(() => pct() >= 80)

  return (
    <div class="flex flex-col gap-1.5">
      <div class="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          class="h-full transition-all"
          classList={{
            "bg-accent": !nearLimit(),
            "bg-warning": nearLimit() && !atLimit(),
            "bg-danger": atLimit(),
          }}
          style={{ width: `${pct()}%` }}
        />
      </div>
      <div class="flex items-center justify-between text-2xs">
        <span class="text-text-muted">
          {formatNumber(props.used)} / {formatNumber(props.limit)} runs
        </span>
        <span
          classList={{
            "text-text-muted": !nearLimit(),
            "text-warning": nearLimit() && !atLimit(),
            "text-danger": atLimit(),
          }}
        >
          {pct().toFixed(0)}% used
        </span>
      </div>
    </div>
  )
}

function CurrentPeriodSkeleton() {
  return (
    <div class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div class="flex items-center gap-2">
        <Skeleton class="h-4 w-4" />
        <Skeleton class="h-4 w-32" />
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <For each={[1, 2, 3, 4]}>
          {() => (
            <div class="flex flex-col gap-1 rounded-lg border border-border bg-surface-elevated p-3">
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-6 w-12" />
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <Skeleton class="h-4 w-24" />
      <div class="flex flex-col">
        <For each={[1, 2, 3]}>
          {() => (
            <div class="flex items-center justify-between border-b border-border py-2 last:border-0">
              <Skeleton class="h-3 w-28" />
              <Skeleton class="h-3 w-16" />
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div class="flex h-48 flex-col items-center justify-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted">
        <ChartBar class="h-4 w-4 text-text-muted" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-xs font-medium text-text">No usage data yet</p>
        <p class="mt-0.5 text-2xs text-text-muted">Usage will appear here once agents start running</p>
      </div>
    </div>
  )
}

function LimitWarning(props: { usage: UsageCurrent; subscription: SubscriptionCurrent | null }) {
  const plan = () => (props.subscription?.plan || "free") as SubscriptionPlan
  const limits = createMemo(() => getPlanLimits(plan()))
  const runLimit = createMemo(() => limits().runLimit)
  const pct = createMemo(() => (runLimit() !== null ? (props.usage.runCount / runLimit()!) * 100 : 0))
  const atLimit = createMemo(() => pct() >= 100)
  const nearLimit = createMemo(() => pct() >= 80 && pct() < 100)
  const isFree = createMemo(() => props.subscription?.plan === "free")

  const warning = createMemo(() => {
    const { overageRate } = limits()
    const limit = runLimit()
    if (limit === null) return null
    if (atLimit() && isFree()) {
      return {
        title: "Run limit exceeded",
        message: `You have reached your monthly limit of ${limit.toLocaleString()} runs. Upgrade to a paid plan to continue running agents.`,
      }
    }
    if (atLimit()) {
      const rate = overageRate ? `$${overageRate}` : "$0.08"
      return {
        title: "Run limit exceeded",
        message: `You have exceeded your monthly limit. Overage charges will apply at ${rate} per additional run.`,
      }
    }
    if (nearLimit()) {
      return {
        title: "Approaching run limit",
        message: `You have used ${pct().toFixed(0)}% of your monthly run limit (${props.usage.runCount.toLocaleString()} / ${limit.toLocaleString()} runs).`,
      }
    }
    return null
  })

  return (
    <Show when={warning()}>
      {(w) => (
        <div
          class="flex items-start gap-3 rounded-lg border p-3"
          classList={{ "border-warning bg-warning/5": nearLimit(), "border-danger bg-danger/5": atLimit() }}
        >
          <Warning
            class="h-4 w-4 shrink-0"
            classList={{ "text-warning": nearLimit(), "text-danger": atLimit() }}
            weight="fill"
          />
          <div class="flex flex-1 flex-col gap-1">
            <p class="text-xs font-medium" classList={{ "text-warning": nearLimit(), "text-danger": atLimit() }}>
              {w().title}
            </p>
            <p class="text-2xs text-text-muted">{w().message}</p>
          </div>
        </div>
      )}
    </Show>
  )
}

export function UsageList(props: UsageListProps) {
  const empty = createMemo(() => !props.current?.runCount && props.history.length === 0)

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <SettingsHeader title="Usage" />

      <div class="flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
        <Show when={props.loading}>
          <div class="flex flex-col gap-4">
            <CurrentPeriodSkeleton />
            <HistorySkeleton />
          </div>
        </Show>

        <Show when={!props.loading && empty()}>
          <EmptyState />
        </Show>

        <Show when={!props.loading && props.current}>
          {(current) => {
            const plan = () => (props.subscription?.plan || "free") as SubscriptionPlan
            const runLimit = () => getPlanLimits(plan()).runLimit

            return (
              <div class="flex flex-col gap-4">
                <LimitWarning usage={current()} subscription={props.subscription} />
                <div class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <ChartBar class="h-4 w-4 text-text-muted" weight="duotone" />
                      <span class="text-xs font-medium text-text">Current Period</span>
                    </div>
                    <span class="text-2xs text-text-muted">{formatPeriod(current().periodStart)}</span>
                  </div>

                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Total Runs" value={current().runCount} />
                    <StatCard label="User" value={current().runsUser} icon={<User class="h-3 w-3 text-text-muted" />} />
                    <StatCard
                      label="Trigger"
                      value={current().runsTrigger}
                      icon={<Lightning class="h-3 w-3 text-text-muted" />}
                    />
                    <StatCard
                      label="Sub-agent"
                      value={current().runsSubagent}
                      icon={<Robot class="h-3 w-3 text-text-muted" />}
                    />
                  </div>

                  <Show when={runLimit() !== null && runLimit()! > 0}>
                    <ProgressBar used={current().runCount} limit={runLimit()!} />
                  </Show>
                </div>

                <Show when={props.history.length > 0}>
                  <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                    <span class="text-xs font-medium text-text">History</span>
                    <div class="flex flex-col">
                      <For each={props.history}>
                        {(period) => (
                          <div class="flex items-center justify-between border-b border-border py-2 last:border-0">
                            <span class="text-xs text-text">{formatPeriod(period.periodStart)}</span>
                            <div class="flex items-center gap-3">
                              <span class="text-2xs text-text-muted">{formatNumber(period.runsUser)} user</span>
                              <span class="text-2xs text-text-muted">{formatNumber(period.runsTrigger)} trigger</span>
                              <span class="text-2xs text-text-muted">
                                {formatNumber(period.runsSubagent)} sub-agent
                              </span>
                              <span class="text-xs font-medium text-text">{formatNumber(period.runCount)} runs</span>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            )
          }}
        </Show>
      </div>
    </div>
  )
}
