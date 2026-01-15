import { createSignal, createEffect, onCleanup, For, Show, getOwner, runWithOwner } from "solid-js"
import { Portal } from "solid-js/web"
import { Clock, CaretDown, Check } from "phosphor-solid-js"

type TimePickerProps = {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
  step?: number
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

function parseTimeInput(input: string): string | null {
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

export function TimePicker(props: TimePickerProps) {
  const [open, setOpen] = createSignal(false)
  const [dropdownPos, setDropdownPos] = createSignal({ top: 0, left: 0, width: 0 })
  const owner = getOwner()
  let triggerRef: HTMLDivElement | undefined

  const step = () => props.step ?? 15
  const options = () => generateTimeOptions(step())

  const baseClass =
    "h-7 w-full rounded bg-surface-elevated text-xs leading-tight text-text transition-colors duration-100 outline-none disabled:opacity-40"
  const borderClass = () =>
    props.hasError
      ? "border border-danger focus-within:border-danger focus-within:shadow-[0_0_0_1px_var(--color-danger)]"
      : "border border-border focus-within:border-accent focus-within:shadow-[0_0_0_1px_var(--color-accent)]"

  const updateDropdownPosition = () => {
    if (!triggerRef) return
    const rect = triggerRef.getBoundingClientRect()
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }

  createEffect(() => {
    if (open()) {
      updateDropdownPosition()
      window.addEventListener("scroll", updateDropdownPosition, true)
      window.addEventListener("resize", updateDropdownPosition)
      onCleanup(() => {
        window.removeEventListener("scroll", updateDropdownPosition, true)
        window.removeEventListener("resize", updateDropdownPosition)
      })
    }
  })

  createEffect(() => {
    if (!open()) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        setOpen(false)
        return
      }
      if (target.closest("[data-time-toggle]")) return
      if (target.closest("[data-time-menu]")) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    onCleanup(() => document.removeEventListener("mousedown", handleClick))
  })

  const handleSelect = (time: string) => {
    queueMicrotask(() => runWithOwner(owner, () => props.onChange?.(time)))
    setOpen(false)
  }

  const handleInputBlur = (e: FocusEvent & { currentTarget: HTMLInputElement }) => {
    const input = e.currentTarget.value.trim()
    if (input === "") {
      queueMicrotask(() => runWithOwner(owner, () => props.onChange?.(undefined as unknown as string)))
      e.currentTarget.value = ""
      props.onBlur?.()
      return
    }
    const parsed = parseTimeInput(input)
    if (parsed) {
      handleSelect(parsed)
    }
    e.currentTarget.value = props.value ? formatTimeDisplay(props.value) : ""
    props.onBlur?.()
  }

  return (
    <div ref={triggerRef} class="relative flex w-full">
      <div class={`${baseClass} ${borderClass()} relative flex items-center`}>
        <Clock class="absolute left-2 h-3.5 w-3.5 text-text-muted" />
        <input
          type="text"
          class="h-full w-full bg-transparent pl-8 pr-7 text-xs outline-none"
          placeholder={props.placeholder ?? "HH:MM"}
          value={props.value ? formatTimeDisplay(props.value) : ""}
          onFocus={() => !props.disabled && setOpen(true)}
          onClick={() => !props.disabled && setOpen(true)}
          onBlur={handleInputBlur}
          disabled={props.disabled}
          autocomplete="off"
          data-time-toggle
        />
        <button
          type="button"
          class="absolute right-2 transition-transform duration-150"
          style={{ transform: open() ? "rotate(180deg)" : "rotate(0deg)" }}
          onClick={() => !props.disabled && setOpen(!open())}
          disabled={props.disabled}
          tabIndex={-1}
        >
          <CaretDown class="h-3.5 w-3.5 text-text-muted" />
        </button>
      </div>

      <Show when={open()}>
        <Portal>
          <div
            class="fixed z-1010 max-h-80 overflow-hidden rounded border border-border bg-surface-floating shadow-lg"
            style={{
              top: `${dropdownPos().top}px`,
              left: `${dropdownPos().left}px`,
              width: `${dropdownPos().width}px`,
            }}
            data-time-menu
            onMouseDown={(e) => e.preventDefault()}
          >
            <div class="max-h-60 overflow-auto">
              <For each={options()}>
                {(time) => {
                  const isSelected = () => props.value === time
                  return (
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-muted"
                      classList={{ "bg-surface-muted": isSelected() }}
                      onClick={() => handleSelect(time)}
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
