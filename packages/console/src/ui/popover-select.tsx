import { createSignal, createEffect, onCleanup, For, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { Check, CaretDown } from "phosphor-solid-js"

export type PopoverSelectOption<T = string> = {
  value: T
  label: string
  color?: string
}

type PopoverSelectProps<T = string> = {
  value?: T
  options: PopoverSelectOption<T>[]
  onChange?: (value: T) => void
  placeholder?: string
  disabled?: boolean
}

export function PopoverSelect<T = string>(props: PopoverSelectProps<T>) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ top: 0, left: 0 })
  let triggerRef: HTMLButtonElement | undefined

  const selected = () => props.options.find((o) => o.value === props.value)
  const color = () => selected()?.color
  const label = () => selected()?.label || props.placeholder || "Select..."

  const updatePosition = () => {
    if (!triggerRef) return
    const rect = triggerRef.getBoundingClientRect()
    setPosition({
      top: rect.top - 4,
      left: rect.left,
    })
  }

  createEffect(() => {
    if (!open()) return
    updatePosition()
    const handleClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) return setOpen(false)
      if (target.closest("[data-popover-toggle]") || target.closest("[data-popover-menu]")) return
      setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKeyDown)
    onCleanup(() => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
    })
  })

  return (
    <div class="relative">
      <button
        ref={triggerRef}
        type="button"
        class="flex items-center gap-1.5 rounded px-2 py-1 text-2xs font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:opacity-40"
        onClick={() => !props.disabled && setOpen((v) => !v)}
        disabled={props.disabled}
        data-popover-toggle
      >
        <Show when={color()}>{(c) => <span class="h-2 w-2 shrink-0 rounded-full" style={{ background: c() }} />}</Show>
        <span>{label()}</span>
        <span class="h-3 w-3 shrink-0 transition-transform" classList={{ "rotate-180": open() }}>
          <CaretDown class="h-3 w-3" />
        </span>
      </button>
      <Show when={open()}>
        <Portal>
          <div
            class="fixed z-[1100] min-w-[180px] max-h-80 overflow-auto rounded border border-border bg-surface-floating shadow-lg scrollbar-thin"
            style={{
              top: `${position().top}px`,
              left: `${position().left}px`,
              transform: "translateY(-100%)",
            }}
            data-popover-menu
          >
            <For each={props.options}>
              {(option) => {
                const isSelected = () => props.value === option.value
                return (
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-2xs transition-colors hover:bg-surface-muted"
                    classList={{ "bg-surface-muted": isSelected() }}
                    onClick={() => {
                      props.onChange?.(option.value)
                      setOpen(false)
                    }}
                  >
                    <div class="flex items-center gap-2">
                      <Show when={option.color}>
                        {(c) => <span class="h-2 w-2 shrink-0 rounded-full" style={{ background: c() }} />}
                      </Show>
                      <span class="font-medium text-text whitespace-nowrap">{option.label}</span>
                    </div>
                    <Show when={isSelected()}>
                      <Check class="h-3 w-3 shrink-0 text-accent" weight="bold" />
                    </Show>
                  </button>
                )
              }}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  )
}
