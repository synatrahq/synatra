import { Show, createSignal, createEffect } from "solid-js"
import { Select, Input, FormField } from "../../../ui"
import { ArrowsClockwise, Terminal } from "phosphor-solid-js"

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

type ScheduleMode = "interval" | "cron"
type IntervalType = "minute" | "hour" | "day" | "week" | "month"

type ScheduleEditorProps = {
  cron: string
  timezone: string
  onCronChange: (cron: string) => void
  onTimezoneChange: (timezone: string) => void
}

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

export function ScheduleEditor(props: ScheduleEditorProps) {
  const [mode, setMode] = createSignal<ScheduleMode>("interval")
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

  createEffect(() => {
    const cron = props.cron
    if (cron === prevCron()) return
    setPrevCron(cron)

    if (!cron) return

    const parsed = parseCronToInterval(cron)
    if (parsed) {
      setMode("interval")
      setInterval(parsed.interval)
      setMinute(parsed.minute)
      setHour(parsed.hour)
      setWeekday(parsed.weekday)
      setDayOfMonth(parsed.dayOfMonth)
      return
    }

    setMode("cron")
    const parts = cron.trim().split(/\s+/)
    if (parts.length === 5) {
      setCronMinutes(parts[0])
      setCronHours(parts[1])
      setCronDayOfMonth(parts[2])
      setCronMonth(parts[3])
      setCronDayOfWeek(parts[4])
    }
  })

  const updateCronFromInterval = () => {
    const cron = intervalToCron(interval(), minute(), hour(), weekday(), dayOfMonth())
    props.onCronChange(cron)
  }

  const handleModeChange = (newMode: ScheduleMode) => {
    setMode(newMode)
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
    const cron = intervalToCron(value as IntervalType, minute(), hour(), weekday(), dayOfMonth())
    props.onCronChange(cron)
  }

  const handleMinuteChange = (value: string) => {
    setMinute(value)
    const cron = intervalToCron(interval(), value, hour(), weekday(), dayOfMonth())
    props.onCronChange(cron)
  }

  const handleHourChange = (value: string) => {
    setHour(value)
    const cron = intervalToCron(interval(), minute(), value, weekday(), dayOfMonth())
    props.onCronChange(cron)
  }

  const handleWeekdayChange = (value: string) => {
    setWeekday(value)
    const cron = intervalToCron(interval(), minute(), hour(), value, dayOfMonth())
    props.onCronChange(cron)
  }

  const handleDayOfMonthChange = (value: string) => {
    setDayOfMonth(value)
    const cron = intervalToCron(interval(), minute(), hour(), weekday(), value)
    props.onCronChange(cron)
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

  return (
    <div class="space-y-3">
      <FormField horizontal labelWidth="5rem" label="Mode">
        <div class="flex gap-1.5">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
            classList={{
              "border-accent bg-accent/5 text-text": mode() === "interval",
              "border-border text-text-muted hover:border-border-strong": mode() !== "interval",
            }}
            onClick={() => handleModeChange("interval")}
          >
            <ArrowsClockwise class="h-3 w-3" />
            Interval
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
            classList={{
              "border-accent bg-accent/5 text-text": mode() === "cron",
              "border-border text-text-muted hover:border-border-strong": mode() !== "cron",
            }}
            onClick={() => handleModeChange("cron")}
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

      <Show when={mode() === "interval"}>
        <FormField horizontal labelWidth="5rem" label="Run every">
          <div class="flex flex-wrap items-center gap-2">
            <Select value={interval()} options={INTERVALS} onChange={handleIntervalChange} class="h-7 w-24 text-xs" />

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
              <Select value={weekday()} options={WEEKDAYS} onChange={handleWeekdayChange} class="h-7 w-32 text-xs" />
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

      <Show when={mode() === "cron"}>
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
  )
}
