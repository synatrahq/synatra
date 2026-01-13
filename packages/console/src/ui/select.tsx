import { createEffect, createSignal, For, onCleanup, Show, splitProps, createUniqueId } from "solid-js"
import { Portal } from "solid-js/web"
import type { JSX } from "solid-js"
import { Check, CaretDown, X } from "phosphor-solid-js"

export type SelectOption<T = string> = {
  value: T
  label: string
  icon?: (props: { class?: string }) => JSX.Element
  badge?: string
  color?: string
  disabled?: boolean
}

type SelectProps<T = string> = {
  value?: T
  options: SelectOption<T>[]
  onChange?: (value: T) => void
  placeholder?: string
  disabled?: boolean
  class?: string
  wrapperClass?: string
  hasError?: boolean
  searchable?: boolean
  allowInput?: boolean
  renderOption?: (option: SelectOption<T>) => JSX.Element
  id?: string
  ariaLabelledby?: string
}

export function Select<T = string>(props: SelectProps<T>) {
  const [local] = splitProps(props, [
    "value",
    "options",
    "onChange",
    "placeholder",
    "disabled",
    "class",
    "wrapperClass",
    "hasError",
    "searchable",
    "allowInput",
    "renderOption",
    "id",
    "ariaLabelledby",
  ])

  const [open, setOpen] = createSignal(false)
  const [search, setSearch] = createSignal("")
  const [inputValue, setInputValue] = createSignal("")
  const [isTyping, setIsTyping] = createSignal(false)
  const [dropdownPos, setDropdownPos] = createSignal({ top: 0, left: 0, width: 0 })

  let triggerRef: HTMLDivElement | undefined

  const BLUR_DEBOUNCE_MS = 150
  const listboxId = createUniqueId()

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
      if (target.closest("[data-select-toggle]")) return
      if (target.closest("[data-select-menu]")) return
      setOpen(false)
    }

    document.addEventListener("mousedown", handleClick)
    onCleanup(() => document.removeEventListener("mousedown", handleClick))
  })

  createEffect(() => {
    if (local.allowInput) {
      const selectedOpt = local.options.find((opt) => opt.value === local.value)
      setInputValue(selectedOpt?.label || "")
    }
  })

  const filteredOptions = () => {
    if (local.allowInput && !isTyping()) {
      return local.options
    }
    const searchTerm = local.allowInput ? inputValue() : search()
    if (!searchTerm.trim()) return local.options
    const term = searchTerm.toLowerCase()
    return local.options.filter(
      (opt) => opt.label.toLowerCase().includes(term) || String(opt.value).toLowerCase().includes(term),
    )
  }

  const hasActiveFilter = () => {
    if (local.allowInput) return inputValue().trim().length > 0
    if (local.searchable) return search().trim().length > 0
    return false
  }

  const selected = () => local.options.find((opt) => opt.value === local.value)

  const handleSelect = (option: SelectOption<T>) => {
    if (option.disabled) return
    local.onChange?.(option.value)
    if (local.allowInput) {
      setInputValue(option.label)
      setIsTyping(false)
    }
    setOpen(false)
    setSearch("")
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    setIsTyping(true)
    if (!open()) setOpen(true)
  }

  const handleInputFocus = () => {
    setIsTyping(false)
    setOpen(true)
  }

  const handleInputBlur = () => {
    setTimeout(() => {
      const exactMatch = local.options.find((opt) => opt.label.toLowerCase() === inputValue().toLowerCase())
      if (exactMatch) {
        local.onChange?.(exactMatch.value)
      }
      setIsTyping(false)
      setOpen(false)
    }, BLUR_DEBOUNCE_MS)
  }

  const baseClass =
    "h-7 w-full rounded border border-border bg-surface-elevated px-2 text-xs leading-tight text-text transition-colors duration-100 outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)] disabled:opacity-40"
  const errorClass = local.hasError
    ? "border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_1px_var(--color-danger)]"
    : ""
  const buttonClass = local.class
    ? `${baseClass} ${errorClass} ${local.class}`
    : errorClass
      ? `${baseClass} ${errorClass}`
      : baseClass

  const wrapperClass = local.wrapperClass || "relative flex w-full"

  return (
    <div ref={triggerRef} class={wrapperClass}>
      <Show
        when={local.allowInput}
        fallback={
          <button
            type="button"
            id={local.id}
            class={`${buttonClass} flex items-center justify-between gap-2`}
            onClick={() => !local.disabled && setOpen(!open())}
            disabled={local.disabled}
            data-select-toggle
            aria-expanded={open()}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-labelledby={local.ariaLabelledby}
          >
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <Show when={selected()?.color}>
                {(color) => <span class="h-2 w-2 shrink-0 rounded-full" style={{ background: color() }} />}
              </Show>
              <Show when={selected()?.icon} keyed>
                {(Icon) => <Icon class="h-3.5 w-3.5 shrink-0 text-text-muted" />}
              </Show>
              <span class="truncate">
                {(() => {
                  const label = selected()?.label
                  if (label !== undefined && label !== null && label !== "") return label
                  return local.placeholder || "Select..."
                })()}
              </span>
              <Show when={selected()?.badge}>
                {(badge) => (
                  <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    {badge()}
                  </span>
                )}
              </Show>
            </div>
            <span
              class="inline-flex shrink-0 transition-transform duration-150"
              style={{ transform: open() ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <CaretDown class="h-3.5 w-3.5 text-text-muted" />
            </span>
          </button>
        }
      >
        <div class="relative w-full" data-select-toggle>
          <input
            id={local.id}
            type="text"
            value={inputValue()}
            onInput={(e) => handleInputChange(e.currentTarget.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={local.placeholder || "Type or select..."}
            disabled={local.disabled}
            class={`${buttonClass} pr-8`}
            autocomplete="off"
            role="combobox"
            aria-expanded={open()}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-labelledby={local.ariaLabelledby}
          />
          <div class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
            <span
              class="inline-flex transition-transform duration-150"
              style={{ transform: open() ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <CaretDown class="h-3.5 w-3.5 text-text-muted" />
            </span>
          </div>
        </div>
      </Show>

      <Show when={open()}>
        <Portal>
          <div
            class="fixed z-1010 max-h-80 overflow-hidden rounded border border-border bg-surface-floating shadow-lg"
            style={{
              top: `${dropdownPos().top}px`,
              left: `${dropdownPos().left}px`,
              width: `${dropdownPos().width}px`,
            }}
            data-select-menu
            role="listbox"
            id={listboxId}
          >
            <Show when={local.searchable && !local.allowInput}>
              <div class="border-b border-border p-2">
                <input
                  type="text"
                  value={search()}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                  placeholder="Search..."
                  class="h-7 w-full rounded border border-border bg-surface-elevated px-2 text-xs outline-none focus-visible:border-accent"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </Show>

            <div class="max-h-60 overflow-auto">
              <Show
                when={filteredOptions().length > 0}
                fallback={
                  <div class="px-3 py-6 text-center text-xs text-text-muted">
                    {hasActiveFilter() ? "No options found" : "No options available"}
                  </div>
                }
              >
                <For each={filteredOptions()}>
                  {(option) => {
                    const isSelected = () => local.value === option.value
                    return (
                      <button
                        type="button"
                        class="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-muted disabled:opacity-40"
                        classList={{ "bg-surface-muted": isSelected() }}
                        onClick={() => handleSelect(option)}
                        disabled={option.disabled}
                        role="option"
                        aria-selected={isSelected()}
                      >
                        <Show
                          when={local.renderOption}
                          fallback={
                            <div class="flex min-w-0 flex-1 items-center gap-2">
                              <Show when={option.color}>
                                {(color) => (
                                  <span class="h-2 w-2 shrink-0 rounded-full" style={{ background: color() }} />
                                )}
                              </Show>
                              <Show when={option.icon} keyed>
                                {(Icon) => <Icon class="h-3.5 w-3.5 shrink-0 text-text-muted" />}
                              </Show>
                              <span class="truncate">{option.label || "\u00A0"}</span>
                              <Show when={option.badge}>
                                {(badge) => (
                                  <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                                    {badge()}
                                  </span>
                                )}
                              </Show>
                            </div>
                          }
                        >
                          {local.renderOption!(option)}
                        </Show>
                        <Show when={isSelected()}>
                          <Check class="h-3.5 w-3.5 shrink-0 text-accent" weight="bold" />
                        </Show>
                      </button>
                    )
                  }}
                </For>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  )
}
