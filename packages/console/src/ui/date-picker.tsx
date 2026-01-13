import { DatePicker as ArkDatePicker, parseDate } from "@ark-ui/solid/date-picker"
import { Index, createMemo, createSignal, getOwner, runWithOwner } from "solid-js"
import { Portal } from "solid-js/web"
import { CalendarBlank, CaretLeft, CaretRight } from "phosphor-solid-js"

type DatePickerProps = {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
}

export function DatePicker(props: DatePickerProps) {
  const [open, setOpen] = createSignal(false)
  const owner = getOwner()
  const base =
    "h-7 w-full rounded bg-surface-elevated pl-8 pr-2 text-xs leading-tight text-text transition-colors duration-100 outline-none disabled:opacity-40"
  const border = () =>
    props.hasError
      ? "border border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_1px_var(--color-danger)]"
      : "border border-border focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)]"

  const handleChange = (details: { value: { year: number; month: number; day: number }[] }) => {
    if (details.value[0]) {
      const { year, month, day } = details.value[0]
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      queueMicrotask(() => runWithOwner(owner, () => props.onChange?.(iso)))
    }
  }

  const parsedValue = createMemo(() => {
    if (!props.value) return []
    const dateOnly = props.value.split("T")[0]
    const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return []
    return [parseDate(dateOnly)]
  })

  return (
    <ArkDatePicker.Root
      onValueChange={handleChange}
      value={parsedValue()}
      open={open()}
      onOpenChange={(details) => {
        const wasOpen = open()
        setOpen(details.open)
        if (wasOpen && !details.open) props.onBlur?.()
      }}
      positioning={{ placement: "bottom-start" }}
    >
      <ArkDatePicker.Control class="relative flex w-full">
        <ArkDatePicker.Input
          class={`${base} ${border()}`}
          placeholder={props.placeholder ?? "MM/DD/YYYY"}
          disabled={props.disabled}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
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
  )
}
