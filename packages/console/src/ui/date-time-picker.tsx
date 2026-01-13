import { DatePicker as ArkDatePicker, parseDate } from "@ark-ui/solid/date-picker"
import { createSignal, createMemo, createEffect, onCleanup, Index, Show, For, getOwner, runWithOwner } from "solid-js"
import { Portal } from "solid-js/web"
import { CalendarBlank, CaretLeft, CaretRight, Check } from "phosphor-solid-js"

type DateTimePickerProps = {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
}

function generateTimeOptions(step: number): string[] {
  const options: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += step) {
      options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
    }
  }
  return options
}

function formatTimeDisplay(time: string): string {
  if (!time) return ""
  const [h, m] = time.split(":")
  const hour = parseInt(h, 10)
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${hour12}:${m} ${period}`
}

export function DateTimePicker(props: DateTimePickerProps) {
  const [dateOpen, setDateOpen] = createSignal(false)
  const [timeOpen, setTimeOpen] = createSignal(false)
  const [dropdownPos, setDropdownPos] = createSignal({ top: 0, left: 0, width: 0 })
  const owner = getOwner()
  let containerRef: HTMLDivElement | undefined
  let timeRef: HTMLInputElement | undefined

  const datePart = createMemo(() => {
    if (!props.value) return ""
    return props.value.split("T")[0] || ""
  })

  const timePart = createMemo(() => {
    if (!props.value) return ""
    const parts = props.value.split("T")
    if (parts.length < 2) return ""
    return parts[1].substring(0, 5)
  })

  const timeSuffix = createMemo(() => {
    if (!props.value) return ":00"
    const parts = props.value.split("T")
    if (parts.length < 2) return ":00"
    const timePart = parts[1]
    if (timePart.length <= 5) return ":00"
    return timePart.substring(5)
  })

  const parsedDateValue = createMemo(() => {
    const d = datePart()
    if (!d) return []
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return []
    return [parseDate(d)]
  })

  const timeOptions = generateTimeOptions(15)

  const handleDateChange = (details: { value: { year: number; month: number; day: number }[] }) => {
    if (details.value[0]) {
      const { year, month, day } = details.value[0]
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const time = timePart() || "00:00"
      const suffix = timeSuffix()
      queueMicrotask(() => runWithOwner(owner, () => props.onChange?.(`${iso}T${time}${suffix}`)))
    }
  }

  const handleTimeSelect = (time: string) => {
    const date = datePart() || new Date().toISOString().split("T")[0]
    const suffix = timeSuffix()
    queueMicrotask(() => runWithOwner(owner, () => props.onChange?.(`${date}T${time}${suffix}`)))
    setTimeOpen(false)
  }

  const parseTimeInput = (input: string): string | null => {
    const normalized = input.trim().toUpperCase()
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/)
    if (match24) {
      const h = parseInt(match24[1], 10)
      const m = parseInt(match24[2], 10)
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      }
    }
    const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
    if (match12) {
      let h = parseInt(match12[1], 10)
      const m = parseInt(match12[2], 10)
      const period = match12[3]
      if (h >= 1 && h <= 12 && m >= 0 && m < 60) {
        if (period === "AM" && h === 12) h = 0
        else if (period === "PM" && h !== 12) h += 12
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      }
    }
    return null
  }

  const handleTimeInputBlur = (e: FocusEvent & { currentTarget: HTMLInputElement }) => {
    const input = e.currentTarget.value.trim()
    if (input === "") {
      handleTimeSelect("00:00")
      e.currentTarget.value = formatTimeDisplay("00:00")
      props.onBlur?.()
      return
    }
    const parsed = parseTimeInput(input)
    if (parsed) {
      handleTimeSelect(parsed)
    }
    e.currentTarget.value = timePart() ? formatTimeDisplay(timePart()) : ""
    props.onBlur?.()
  }

  const updateTimeDropdownPosition = () => {
    if (!timeRef) return
    const rect = timeRef.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 120) })
  }

  createEffect(() => {
    if (timeOpen()) {
      updateTimeDropdownPosition()
      window.addEventListener("scroll", updateTimeDropdownPosition, true)
      window.addEventListener("resize", updateTimeDropdownPosition)
      onCleanup(() => {
        window.removeEventListener("scroll", updateTimeDropdownPosition, true)
        window.removeEventListener("resize", updateTimeDropdownPosition)
      })
    }
  })

  createEffect(() => {
    if (!timeOpen()) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) return setTimeOpen(false)
      if (target.closest("[data-datetime-time]")) return
      if (target.closest("[data-datetime-time-menu]")) return
      setTimeOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    onCleanup(() => document.removeEventListener("mousedown", handleClick))
  })

  const baseClass =
    "h-7 w-full rounded bg-surface-elevated text-xs leading-tight text-text transition-colors duration-100 outline-none disabled:opacity-40"
  const borderClass = () =>
    props.hasError
      ? "border border-danger focus-within:border-danger focus-within:shadow-[0_0_0_1px_var(--color-danger)]"
      : "border border-border focus-within:border-accent focus-within:shadow-[0_0_0_1px_var(--color-accent)]"

  return (
    <div ref={containerRef} class={`${baseClass} ${borderClass()} flex items-center`}>
      <ArkDatePicker.Root
        onValueChange={handleDateChange}
        value={parsedDateValue()}
        open={dateOpen()}
        onOpenChange={(details) => {
          const wasOpen = dateOpen()
          setDateOpen(details.open)
          if (wasOpen && !details.open) props.onBlur?.()
        }}
        positioning={{ placement: "bottom-start" }}
      >
        <ArkDatePicker.Control class="relative flex items-center">
          <ArkDatePicker.Input
            class="h-full w-30 bg-transparent pl-8 pr-0 text-xs outline-none"
            placeholder="MM/DD/YYYY"
            disabled={props.disabled}
            onFocus={() => setDateOpen(true)}
            onClick={() => setDateOpen(true)}
          />
          <ArkDatePicker.Trigger class="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted">
            <CalendarBlank class="h-3.5 w-3.5" />
          </ArkDatePicker.Trigger>
        </ArkDatePicker.Control>

        <Portal>
          <ArkDatePicker.Positioner>
            <ArkDatePicker.Content class="z-1010 rounded border border-border bg-surface-floating p-3 shadow-lg">
              <ArkDatePicker.View view="day">
                <ArkDatePicker.Context>
                  {(context) => (
                    <>
                      <ArkDatePicker.ViewControl class="mb-2 flex items-center justify-between">
                        <ArkDatePicker.PrevTrigger class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text">
                          <CaretLeft class="h-3.5 w-3.5" />
                        </ArkDatePicker.PrevTrigger>
                        <ArkDatePicker.ViewTrigger class="text-xs font-medium text-text hover:text-accent">
                          <ArkDatePicker.RangeText />
                        </ArkDatePicker.ViewTrigger>
                        <ArkDatePicker.NextTrigger class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text">
                          <CaretRight class="h-3.5 w-3.5" />
                        </ArkDatePicker.NextTrigger>
                      </ArkDatePicker.ViewControl>
                      <ArkDatePicker.Table class="w-full border-collapse">
                        <ArkDatePicker.TableHead>
                          <ArkDatePicker.TableRow>
                            <Index each={context().weekDays}>
                              {(weekDay) => (
                                <ArkDatePicker.TableHeader class="pb-1 text-center text-2xs font-medium text-text-muted">
                                  {weekDay().short}
                                </ArkDatePicker.TableHeader>
                              )}
                            </Index>
                          </ArkDatePicker.TableRow>
                        </ArkDatePicker.TableHead>
                        <ArkDatePicker.TableBody>
                          <Index each={context().weeks}>
                            {(week) => (
                              <ArkDatePicker.TableRow>
                                <Index each={week()}>
                                  {(day) => (
                                    <ArkDatePicker.TableCell value={day()} class="p-0.5">
                                      <ArkDatePicker.TableCellTrigger class="flex h-7 w-7 items-center justify-center rounded text-xs transition-colors hover:bg-surface-muted data-selected:bg-(--color-accent-soft) data-selected:text-(--color-accent) data-today:font-bold data-outside-range:text-text-muted/50">
                                        {day().day}
                                      </ArkDatePicker.TableCellTrigger>
                                    </ArkDatePicker.TableCell>
                                  )}
                                </Index>
                              </ArkDatePicker.TableRow>
                            )}
                          </Index>
                        </ArkDatePicker.TableBody>
                      </ArkDatePicker.Table>
                    </>
                  )}
                </ArkDatePicker.Context>
              </ArkDatePicker.View>

              <ArkDatePicker.View view="month">
                <ArkDatePicker.Context>
                  {(context) => (
                    <>
                      <ArkDatePicker.ViewControl class="mb-2 flex items-center justify-between">
                        <ArkDatePicker.PrevTrigger class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text">
                          <CaretLeft class="h-3.5 w-3.5" />
                        </ArkDatePicker.PrevTrigger>
                        <ArkDatePicker.ViewTrigger class="text-xs font-medium text-text hover:text-accent">
                          <ArkDatePicker.RangeText />
                        </ArkDatePicker.ViewTrigger>
                        <ArkDatePicker.NextTrigger class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text">
                          <CaretRight class="h-3.5 w-3.5" />
                        </ArkDatePicker.NextTrigger>
                      </ArkDatePicker.ViewControl>
                      <ArkDatePicker.Table class="w-full border-collapse">
                        <ArkDatePicker.TableBody>
                          <Index each={context().getMonthsGrid({ columns: 4, format: "short" })}>
                            {(months) => (
                              <ArkDatePicker.TableRow>
                                <Index each={months()}>
                                  {(month) => (
                                    <ArkDatePicker.TableCell value={month().value} class="p-0.5">
                                      <ArkDatePicker.TableCellTrigger class="flex h-8 w-full items-center justify-center rounded text-xs transition-colors hover:bg-surface-muted data-selected:bg-(--color-accent-soft) data-selected:text-(--color-accent)">
                                        {month().label}
                                      </ArkDatePicker.TableCellTrigger>
                                    </ArkDatePicker.TableCell>
                                  )}
                                </Index>
                              </ArkDatePicker.TableRow>
                            )}
                          </Index>
                        </ArkDatePicker.TableBody>
                      </ArkDatePicker.Table>
                    </>
                  )}
                </ArkDatePicker.Context>
              </ArkDatePicker.View>

              <ArkDatePicker.View view="year">
                <ArkDatePicker.Context>
                  {(context) => (
                    <>
                      <ArkDatePicker.ViewControl class="mb-2 flex items-center justify-between">
                        <ArkDatePicker.PrevTrigger class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text">
                          <CaretLeft class="h-3.5 w-3.5" />
                        </ArkDatePicker.PrevTrigger>
                        <ArkDatePicker.ViewTrigger class="text-xs font-medium text-text hover:text-accent">
                          <ArkDatePicker.RangeText />
                        </ArkDatePicker.ViewTrigger>
                        <ArkDatePicker.NextTrigger class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text">
                          <CaretRight class="h-3.5 w-3.5" />
                        </ArkDatePicker.NextTrigger>
                      </ArkDatePicker.ViewControl>
                      <ArkDatePicker.Table class="w-full border-collapse">
                        <ArkDatePicker.TableBody>
                          <Index each={context().getYearsGrid({ columns: 4 })}>
                            {(years) => (
                              <ArkDatePicker.TableRow>
                                <Index each={years()}>
                                  {(year) => (
                                    <ArkDatePicker.TableCell value={year().value} class="p-0.5">
                                      <ArkDatePicker.TableCellTrigger class="flex h-8 w-full items-center justify-center rounded text-xs transition-colors hover:bg-surface-muted data-selected:bg-(--color-accent-soft) data-selected:text-(--color-accent)">
                                        {year().label}
                                      </ArkDatePicker.TableCellTrigger>
                                    </ArkDatePicker.TableCell>
                                  )}
                                </Index>
                              </ArkDatePicker.TableRow>
                            )}
                          </Index>
                        </ArkDatePicker.TableBody>
                      </ArkDatePicker.Table>
                    </>
                  )}
                </ArkDatePicker.Context>
              </ArkDatePicker.View>
            </ArkDatePicker.Content>
          </ArkDatePicker.Positioner>
        </Portal>
      </ArkDatePicker.Root>

      <div class="h-4 w-px bg-border" />

      <input
        ref={timeRef}
        type="text"
        class="w-18 bg-transparent pl-0 pr-2 text-xs outline-none placeholder:text-text-muted disabled:pointer-events-none"
        placeholder="HH:MM"
        value={timePart() ? formatTimeDisplay(timePart()) : ""}
        onFocus={() => !props.disabled && setTimeOpen(true)}
        onClick={() => !props.disabled && setTimeOpen(true)}
        onBlur={handleTimeInputBlur}
        disabled={props.disabled}
        data-datetime-time
      />

      <Show when={timeOpen()}>
        <Portal>
          <div
            class="fixed z-1010 max-h-80 overflow-hidden rounded border border-border bg-surface-floating shadow-lg"
            style={{
              top: `${dropdownPos().top}px`,
              left: `${dropdownPos().left}px`,
              width: `${dropdownPos().width}px`,
            }}
            data-datetime-time-menu
            onMouseDown={(e) => e.preventDefault()}
          >
            <div class="max-h-60 overflow-auto">
              <For each={timeOptions}>
                {(time) => {
                  const isSelected = () => timePart() === time
                  return (
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-muted"
                      classList={{ "bg-surface-muted": isSelected() }}
                      onClick={() => handleTimeSelect(time)}
                    >
                      <span class="truncate">{formatTimeDisplay(time)}</span>
                      <Show when={isSelected()}>
                        <Check class="h-3.5 w-3.5 shrink-0 text-accent" weight="bold" />
                      </Show>
                    </button>
                  )
                }}
              </For>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  )
}
