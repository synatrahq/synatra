import { Show, createSignal, createEffect, on } from "solid-js"
import { ScheduleMode } from "@synatra/core/types"
import { Broadcast, Timer, Cube, ArrowsClockwise, Terminal, Plus } from "phosphor-solid-js"
import { FormField, Select, Input, MultiSelect, CollapsibleSection } from "../../../../ui"
import { AppIcon } from "../../../../components"

const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const PRESET_TIMEZONES = [
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Seoul", label: "Asia/Seoul (KST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
]

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  ...(LOCAL_TIMEZONE !== "UTC" ? [{ value: LOCAL_TIMEZONE, label: `Local (${LOCAL_TIMEZONE})` }] : []),
  ...PRESET_TIMEZONES.filter((tz) => tz.value !== LOCAL_TIMEZONE),
]

const INTERVALS = [
  { value: "minute", label: "minute" },
  { value: "hour", label: "hour" },
  { value: "day", label: "day" },
  { value: "week", label: "week" },
  { value: "month", label: "month" },
]

const MINUTES_PAST_HOUR = [
  { value: "0", label: "at 0 minutes past the hour" },
  { value: "15", label: "at 15 minutes past the hour" },
  { value: "30", label: "at 30 minutes past the hour" },
  { value: "45", label: "at 45 minutes past the hour" },
]

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i
  const suffix = i < 12 ? "AM" : "PM"
  return { value: String(i), label: `at ${hour12}:00 ${suffix}` }
})

const WEEKDAYS = [
  { value: "0", label: "on Sunday" },
  { value: "1", label: "on Monday" },
  { value: "2", label: "on Tuesday" },
  { value: "3", label: "on Wednesday" },
  { value: "4", label: "on Thursday" },
  { value: "5", label: "on Friday" },
  { value: "6", label: "on Saturday" },
]

function getOrdinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th"
  switch (n % 10) {
    case 1:
      return "st"
    case 2:
      return "nd"
    case 3:
      return "rd"
    default:
      return "th"
  }
}

const DAYS_OF_MONTH = [
  ...Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `on the ${i + 1}${getOrdinalSuffix(i + 1)}`,
  })),
  { value: "L", label: "on the last day" },
]

const APP_EVENTS: Record<string, { value: string; label: string }[]> = {
  intercom: [
    { value: "conversation.user.created", label: "New conversation" },
    { value: "conversation.user.replied", label: "Customer replied" },
    { value: "conversation.admin.replied", label: "Admin replied" },
    { value: "conversation.admin.closed", label: "Conversation closed" },
  ],
  github: [
    { value: "push", label: "Push" },
    { value: "create.branch", label: "Branch created" },
    { value: "create.tag", label: "Tag created" },
    { value: "delete.branch", label: "Branch deleted" },
    { value: "delete.tag", label: "Tag deleted" },
    { value: "pull_request.opened", label: "PR opened" },
    { value: "pull_request.merged", label: "PR merged" },
    { value: "pull_request.closed", label: "PR closed" },
    { value: "pull_request.reopened", label: "PR reopened" },
    { value: "pull_request.synchronize", label: "PR updated" },
    { value: "pull_request.ready_for_review", label: "PR ready for review" },
    { value: "issues.opened", label: "Issue opened" },
    { value: "issues.closed", label: "Issue closed" },
    { value: "issues.reopened", label: "Issue reopened" },
    { value: "issue_comment.created", label: "Issue comment" },
    { value: "pull_request_comment.created", label: "PR comment" },
    { value: "pull_request_review.approved", label: "Review approved" },
    { value: "pull_request_review.changes_requested", label: "Changes requested" },
    { value: "pull_request_review.commented", label: "Review commented" },
    { value: "release.published", label: "Release published" },
  ],
}

type IntervalType = "minute" | "hour" | "day" | "week" | "month"

function parseCronToInterval(cron: string): {
  mode: ScheduleMode
  interval: IntervalType
  minute: string
  hour: string
  weekday: string
  dayOfMonth: string
} | null {
  if (!cron) return null
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [min, hr, dom, mon, dow] = parts

  if (min === "*" && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { mode: "interval", interval: "minute", minute: "0", hour: "9", weekday: "1", dayOfMonth: "1" }
  }

  if (/^\d+$/.test(min) && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { mode: "interval", interval: "hour", minute: min, hour: "9", weekday: "1", dayOfMonth: "1" }
  }

  if (/^\d+$/.test(min) && /^\d+$/.test(hr) && dom === "*" && mon === "*" && dow === "*") {
    return { mode: "interval", interval: "day", minute: min, hour: hr, weekday: "1", dayOfMonth: "1" }
  }

  if (/^\d+$/.test(min) && /^\d+$/.test(hr) && dom === "*" && mon === "*" && /^\d$/.test(dow)) {
    return { mode: "interval", interval: "week", minute: min, hour: hr, weekday: dow, dayOfMonth: "1" }
  }

  if (/^\d+$/.test(min) && /^\d+$/.test(hr) && (/^\d+$/.test(dom) || dom === "L") && mon === "*" && dow === "*") {
    return { mode: "interval", interval: "month", minute: min, hour: hr, weekday: "1", dayOfMonth: dom }
  }

  return null
}

function intervalToCron(
  interval: IntervalType,
  minute: string,
  hour: string,
  weekday: string,
  dayOfMonth: string,
): string {
  switch (interval) {
    case "minute":
      return "* * * * *"
    case "hour":
      return `${minute} * * * *`
    case "day":
      return `${minute} ${hour} * * *`
    case "week":
      return `${minute} ${hour} * * ${weekday}`
    case "month":
      return `${minute} ${hour} ${dayOfMonth} * *`
  }
}

type IntercomMetadata = { workspaceName?: string; workspaceId?: string }
type GitHubMetadata = { accountLogin: string; accountType: "User" | "Organization" }

export type AppAccountInfo = {
  id: string
  appId: string
  name: string
  metadata: IntercomMetadata | GitHubMetadata | null
}

function getAppAccountDetail(account: AppAccountInfo | null | undefined): string | null {
  if (!account?.metadata) return null
  if ("workspaceName" in account.metadata) {
    return account.metadata.workspaceName ?? null
  }
  if ("accountLogin" in account.metadata) {
    return `${account.metadata.accountLogin} (${account.metadata.accountType})`
  }
  return null
}

type AgentRelease = {
  id: string
  version: string
  createdAt: string
}

type SettingsInspectorProps = {
  slug: string
  type: "webhook" | "schedule" | "app"
  agentVersionMode: "current" | "fixed"
  agentReleaseId: string | null
  agentReleases: AgentRelease[]
  onTypeChange: (type: "webhook" | "schedule" | "app") => void
  onAgentVersionModeChange: (mode: "current" | "fixed") => void
  onAgentReleaseIdChange: (id: string | null) => void
  cron: string
  scheduleMode: ScheduleMode
  timezone: string
  onCronChange: (cron: string) => void
  onScheduleModeChange: (mode: ScheduleMode) => void
  onTimezoneChange: (timezone: string) => void
  appAccounts: AppAccountInfo[]
  selectedAppAccountId: string | null
  appEvents: string[]
  onAppAccountChange: (id: string | null) => void
  onAppEventsChange: (events: string[]) => void
  onAppConnect?: (appId: string | null) => void
}

export function SettingsInspector(props: SettingsInspectorProps) {
  const [interval, setInterval] = createSignal<IntervalType>("day")
  const [minute, setMinute] = createSignal("0")
  const [hour, setHour] = createSignal("9")
  const [weekday, setWeekday] = createSignal("1")
  const [dayOfMonth, setDayOfMonth] = createSignal("1")
  const [cronMinutes, setCronMinutes] = createSignal("*")
  const [cronHours, setCronHours] = createSignal("*")
  const [cronDayOfMonth, setCronDayOfMonth] = createSignal("*")
  const [cronMonth, setCronMonth] = createSignal("*")
  const [cronDayOfWeek, setCronDayOfWeek] = createSignal("*")
  const [prevCron, setPrevCron] = createSignal<string | null>(null)

  createEffect(
    on(
      () => props.cron,
      (cron) => {
        if (cron === prevCron()) return
        setPrevCron(cron)
        if (!cron) return

        if (props.scheduleMode === "interval") {
          const parsed = parseCronToInterval(cron)
          if (parsed) {
            setInterval(parsed.interval)
            setMinute(parsed.minute)
            setHour(parsed.hour)
            setWeekday(parsed.weekday)
            setDayOfMonth(parsed.dayOfMonth)
          }
        } else {
          const parts = cron.trim().split(/\s+/)
          if (parts.length === 5) {
            setCronMinutes(parts[0])
            setCronHours(parts[1])
            setCronDayOfMonth(parts[2])
            setCronMonth(parts[3])
            setCronDayOfWeek(parts[4])
          }
        }
      },
    ),
  )

  const updateCronFromInterval = () => {
    const cron = intervalToCron(interval(), minute(), hour(), weekday(), dayOfMonth())
    props.onCronChange(cron)
  }

  const handleScheduleModeChange = (newMode: ScheduleMode) => {
    props.onScheduleModeChange(newMode)
    if (newMode === "interval") {
      updateCronFromInterval()
      return
    }
    const parts = props.cron.trim().split(/\s+/)
    if (parts.length === 5) {
      setCronMinutes(parts[0])
      setCronHours(parts[1])
      setCronDayOfMonth(parts[2])
      setCronMonth(parts[3])
      setCronDayOfWeek(parts[4])
    }
  }

  const handleIntervalChange = (value: string) => {
    setInterval(value as IntervalType)
    props.onCronChange(intervalToCron(value as IntervalType, minute(), hour(), weekday(), dayOfMonth()))
  }

  const handleMinuteChange = (value: string) => {
    setMinute(value)
    props.onCronChange(intervalToCron(interval(), value, hour(), weekday(), dayOfMonth()))
  }

  const handleHourChange = (value: string) => {
    setHour(value)
    props.onCronChange(intervalToCron(interval(), minute(), value, weekday(), dayOfMonth()))
  }

  const handleWeekdayChange = (value: string) => {
    setWeekday(value)
    props.onCronChange(intervalToCron(interval(), minute(), hour(), value, dayOfMonth()))
  }

  const handleDayOfMonthChange = (value: string) => {
    setDayOfMonth(value)
    props.onCronChange(intervalToCron(interval(), minute(), hour(), weekday(), value))
  }

  const handleCronFieldChange = (field: string, value: string) => {
    switch (field) {
      case "minutes":
        setCronMinutes(value)
        break
      case "hours":
        setCronHours(value)
        break
      case "dayOfMonth":
        setCronDayOfMonth(value)
        break
      case "month":
        setCronMonth(value)
        break
      case "dayOfWeek":
        setCronDayOfWeek(value)
        break
    }
    const cron = `${field === "minutes" ? value : cronMinutes()} ${field === "hours" ? value : cronHours()} ${field === "dayOfMonth" ? value : cronDayOfMonth()} ${field === "month" ? value : cronMonth()} ${field === "dayOfWeek" ? value : cronDayOfWeek()}`
    props.onCronChange(cron)
  }

  const selectedAppAccount = () => props.appAccounts?.find((a) => a.id === props.selectedAppAccountId)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Trigger">
        <div class="space-y-3">
          <FormField horizontal labelWidth="5rem" label="Slug">
            <span class="py-1 font-code text-xs text-text">{props.slug}</span>
          </FormField>
          <FormField horizontal labelWidth="5rem" label="Type">
            <div class="flex gap-1.5">
              <button
                type="button"
                class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                classList={{
                  "border-accent bg-accent/5 text-text": props.type === "schedule",
                  "border-border text-text-muted hover:border-border-strong": props.type !== "schedule",
                }}
                onClick={() => props.onTypeChange("schedule")}
              >
                <Timer class="h-3 w-3" />
                Schedule
              </button>
              <button
                type="button"
                class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                classList={{
                  "border-accent bg-accent/5 text-text": props.type === "webhook",
                  "border-border text-text-muted hover:border-border-strong": props.type !== "webhook",
                }}
                onClick={() => props.onTypeChange("webhook")}
              >
                <Broadcast class="h-3 w-3" />
                Webhook
              </button>
              <button
                type="button"
                class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                classList={{
                  "border-accent bg-accent/5 text-text": props.type === "app",
                  "border-border text-text-muted hover:border-border-strong": props.type !== "app",
                }}
                onClick={() => props.onTypeChange("app")}
              >
                <Cube class="h-3 w-3" />
                App
              </button>
            </div>
          </FormField>
          <Show when={props.agentReleases.length > 0}>
            <FormField horizontal labelWidth="5rem" label="Agent version">
              <Select
                value={props.agentVersionMode === "current" ? "latest" : (props.agentReleaseId ?? "")}
                options={[
                  { value: "latest", label: "Always use latest" },
                  ...props.agentReleases.map((r) => ({ value: r.id, label: r.version })),
                ]}
                onChange={(value) => {
                  if (value === "latest") {
                    props.onAgentVersionModeChange("current")
                    props.onAgentReleaseIdChange(null)
                  } else {
                    props.onAgentVersionModeChange("fixed")
                    props.onAgentReleaseIdChange(value)
                  }
                }}
                class="h-7 text-xs"
              />
            </FormField>
          </Show>
        </div>
      </CollapsibleSection>

      <Show when={props.type === "schedule"}>
        <CollapsibleSection title="Schedule">
          <div class="space-y-3">
            <FormField horizontal labelWidth="5rem" label="Mode">
              <div class="flex gap-1.5">
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                  classList={{
                    "border-accent bg-accent/5 text-text": props.scheduleMode === "interval",
                    "border-border text-text-muted hover:border-border-strong": props.scheduleMode !== "interval",
                  }}
                  onClick={() => handleScheduleModeChange("interval")}
                >
                  <ArrowsClockwise class="h-3 w-3" />
                  Interval
                </button>
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                  classList={{
                    "border-accent bg-accent/5 text-text": props.scheduleMode === "cron",
                    "border-border text-text-muted hover:border-border-strong": props.scheduleMode !== "cron",
                  }}
                  onClick={() => handleScheduleModeChange("cron")}
                >
                  <Terminal class="h-3 w-3" />
                  Cron
                </button>
              </div>
            </FormField>
            <FormField horizontal labelWidth="5rem" label="Timezone">
              <Select
                value={props.timezone}
                options={TIMEZONES}
                onChange={(value) => props.onTimezoneChange(value)}
                class="h-7 text-xs"
              />
            </FormField>
            <Show when={props.scheduleMode === "interval"}>
              <FormField horizontal labelWidth="5rem" label="Run every" align="start">
                <div class="flex flex-wrap items-center gap-2">
                  <Select
                    value={interval()}
                    options={INTERVALS}
                    onChange={handleIntervalChange}
                    class="h-7 w-24 text-xs"
                  />
                  <Show when={interval() === "hour"}>
                    <Select
                      value={minute()}
                      options={MINUTES_PAST_HOUR}
                      onChange={handleMinuteChange}
                      class="h-7 w-56 text-xs"
                    />
                  </Show>
                  <Show when={interval() === "day"}>
                    <Select value={hour()} options={HOURS} onChange={handleHourChange} class="h-7 w-32 text-xs" />
                  </Show>
                  <Show when={interval() === "week"}>
                    <Select
                      value={weekday()}
                      options={WEEKDAYS}
                      onChange={handleWeekdayChange}
                      class="h-7 w-32 text-xs"
                    />
                    <Select value={hour()} options={HOURS} onChange={handleHourChange} class="h-7 w-32 text-xs" />
                  </Show>
                  <Show when={interval() === "month"}>
                    <Select
                      value={dayOfMonth()}
                      options={DAYS_OF_MONTH}
                      onChange={handleDayOfMonthChange}
                      class="h-7 w-32 text-xs"
                    />
                    <Select value={hour()} options={HOURS} onChange={handleHourChange} class="h-7 w-32 text-xs" />
                  </Show>
                </div>
              </FormField>
            </Show>
            <Show when={props.scheduleMode === "cron"}>
              <FormField horizontal labelWidth="5rem" label="Minutes">
                <Input
                  type="text"
                  value={cronMinutes()}
                  onInput={(e) => handleCronFieldChange("minutes", e.currentTarget.value)}
                  placeholder="*"
                  class="font-code text-xs"
                />
              </FormField>
              <FormField horizontal labelWidth="5rem" label="Hours">
                <Input
                  type="text"
                  value={cronHours()}
                  onInput={(e) => handleCronFieldChange("hours", e.currentTarget.value)}
                  placeholder="*"
                  class="font-code text-xs"
                />
              </FormField>
              <FormField horizontal labelWidth="5rem" label="Day">
                <Input
                  type="text"
                  value={cronDayOfMonth()}
                  onInput={(e) => handleCronFieldChange("dayOfMonth", e.currentTarget.value)}
                  placeholder="*"
                  class="font-code text-xs"
                />
              </FormField>
              <FormField horizontal labelWidth="5rem" label="Month">
                <Input
                  type="text"
                  value={cronMonth()}
                  onInput={(e) => handleCronFieldChange("month", e.currentTarget.value)}
                  placeholder="*"
                  class="font-code text-xs"
                />
              </FormField>
              <FormField horizontal labelWidth="5rem" label="Weekday">
                <Input
                  type="text"
                  value={cronDayOfWeek()}
                  onInput={(e) => handleCronFieldChange("dayOfWeek", e.currentTarget.value)}
                  placeholder="*"
                  class="font-code text-xs"
                />
              </FormField>
            </Show>
          </div>
        </CollapsibleSection>
      </Show>

      <Show when={props.type === "app"}>
        <CollapsibleSection title="App">
          <div class="space-y-3">
            <FormField horizontal labelWidth="5rem" label="Connection">
              <Select
                value={props.selectedAppAccountId ?? ""}
                options={[
                  ...props.appAccounts.map((a) => ({
                    value: a.id,
                    label: a.name,
                    icon: (iconProps: { class?: string }) => <AppIcon appId={a.appId} class={iconProps.class} />,
                  })),
                  ...(props.onAppConnect
                    ? [
                        {
                          value: "__connect_new__",
                          label: "Connect new",
                          icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
                        },
                      ]
                    : []),
                ]}
                onChange={(value) => {
                  if (value === "__connect_new__") {
                    props.onAppConnect?.(null)
                    return
                  }
                  props.onAppAccountChange(value || null)
                }}
                placeholder="Select connection"
                class="h-7 text-xs"
              />
            </FormField>
            <Show when={props.selectedAppAccountId}>
              <FormField horizontal labelWidth="5rem" label="Events">
                <MultiSelect
                  values={props.appEvents}
                  options={(() => {
                    const account = props.appAccounts?.find((a) => a.id === props.selectedAppAccountId)
                    if (!account) return []
                    return APP_EVENTS[account.appId as keyof typeof APP_EVENTS] ?? []
                  })()}
                  onChange={props.onAppEventsChange}
                  placeholder="Select events"
                  class="text-xs"
                />
              </FormField>
              <Show when={getAppAccountDetail(selectedAppAccount())}>
                <FormField horizontal labelWidth="5rem" label="Account">
                  <span class="py-1 text-xs text-text-muted">{getAppAccountDetail(selectedAppAccount())}</span>
                </FormField>
              </Show>
            </Show>
          </div>
        </CollapsibleSection>
      </Show>
    </div>
  )
}
