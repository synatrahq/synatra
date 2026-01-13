import { createEffect, createSignal, For, onCleanup, Show, splitProps, createUniqueId } from "solid-js"
import type { JSX } from "solid-js"
import { Check, CaretDown, X } from "phosphor-solid-js"

export type MultiSelectOption<T = string> = {
  value: T
  label: string
  icon?: (props: { class?: string }) => JSX.Element
  badge?: string
  color?: string
  disabled?: boolean
}

function toggleValue<T>(current: T[], option: MultiSelectOption<T>): T[] {
  if (option.disabled) return current
  const exists = current.some((value) => value === option.value)
  if (exists) return current.filter((value) => value !== option.value)
  return [...current, option.value]
}

function removeValue<T>(current: T[], value: T): T[] {
  if (current.every((entry) => entry !== value)) return current
  return current.filter((entry) => entry !== value)
}

function commitInput<T>(options: MultiSelectOption<T>[], term: string, current: T[]): T[] {
  const normalized = term.trim().toLowerCase()
  if (!normalized) return current
  const option = options.find(
    (candidate) => candidate.label.toLowerCase() === normalized || String(candidate.value).toLowerCase() === normalized,
  )
  if (!option || option.disabled) return current
  if (current.some((value) => value === option.value)) return current
  return [...current, option.value]
}

export type MultiSelectProps<T = string> = {
  values?: T[]
  options: MultiSelectOption<T>[]
  onChange?: (values: T[]) => void
  placeholder?: string
  disabled?: boolean
  class?: string
  wrapperClass?: string
  hasError?: boolean
  searchable?: boolean
  allowInput?: boolean
  renderOption?: (option: MultiSelectOption<T>, selected: boolean) => JSX.Element
  id?: string
  ariaLabelledby?: string
}

export function MultiSelect<T = string>(props: MultiSelectProps<T>) {
  const [local] = splitProps(props, [
    "values",
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
  const [internalValues, setInternalValues] = createSignal<T[]>(local.values ? [...local.values] : [])

  const BLUR_DEBOUNCE_MS = 150
  const listboxId = createUniqueId()

  let inputRef: HTMLInputElement | undefined

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
    if (!local.values) return
    setInternalValues(local.values)
  })

  const selectedValues = () => (local.values ? local.values : internalValues())

  const selectedOptions = () => {
    const values = selectedValues()
    return values
      .map((value) => local.options.find((opt) => opt.value === value))
      .filter((opt): opt is MultiSelectOption<T> => Boolean(opt))
  }
  const hasSelections = () => selectedOptions().length > 0

  const filteredOptions = () => {
    if (local.allowInput && !isTyping()) return local.options
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

  const updateSelection = (next: T[]) => {
    if (!local.values) setInternalValues(next)
    local.onChange?.(next)
  }

  const toggleOption = (option: MultiSelectOption<T>) => {
    const values = selectedValues()
    const next = toggleValue(values, option)
    if (next === values) return
    updateSelection(next)
    if (local.allowInput) {
      setInputValue("")
      setIsTyping(false)
      if (inputRef) {
        inputRef.focus()
      }
    }
  }

  const handleRemoveValue = (value: T) => {
    const values = selectedValues()
    const next = removeValue(values, value)
    if (next === values) return
    updateSelection(next)
  }

  const handleCommitInput = () => {
    const values = selectedValues()
    const next = commitInput(local.options, inputValue(), values)
    if (next === values) return
    updateSelection(next)
    setInputValue("")
    setIsTyping(false)
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    setIsTyping(true)
    if (!open()) setOpen(true)
  }

  const handleInputFocus = () => {
    setIsTyping(false)
    if (local.disabled) return
    setOpen(true)
  }

  const handleInputBlur = (event: FocusEvent) => {
    setTimeout(() => {
      const relatedTarget = event.relatedTarget
      if (relatedTarget instanceof HTMLElement && relatedTarget.closest("[data-select-menu]")) {
        return
      }
      handleCommitInput()
      setIsTyping(false)
      setOpen(false)
    }, BLUR_DEBOUNCE_MS)
  }

  const handleInputKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleCommitInput()
    }
    if (event.key === "Backspace" && !event.currentTarget.value) {
      const values = selectedValues()
      if (values.length === 0) return
      const last = values[values.length - 1]
      if (last === undefined) return
      handleRemoveValue(last)
    }
  }

  const handleContainerKeyDown = (event: KeyboardEvent & { currentTarget: HTMLElement }) => {
    if (event.target !== event.currentTarget) return
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault()
      if (local.disabled) return
      setOpen(!open())
    }
    if (event.key === "Escape") {
      setOpen(false)
    }
  }

  const baseClass =
    "min-h-7 w-full rounded border border-border bg-surface-elevated px-2 py-0.5 text-xs leading-tight text-text transition-all duration-100 outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)] focus-within:border-accent focus-within:shadow-[0_0_0_1px_var(--color-accent)]"
  const errorClass = local.hasError ? "border-danger focus-visible:border-danger focus-within:border-danger" : ""
  const disabledClass = local.disabled ? "cursor-not-allowed opacity-40" : ""
  const controlClass = local.class
    ? `${baseClass} ${errorClass} ${disabledClass} ${local.class}`
    : `${baseClass} ${errorClass} ${disabledClass}`

  const wrapperClass = local.wrapperClass || "relative flex w-full"

  return (
    <div class={wrapperClass}>
      <div
        class={`${controlClass} flex w-full items-center gap-2`}
        id={local.id}
        data-select-toggle
        role="combobox"
        tabIndex={local.disabled ? -1 : 0}
        aria-expanded={open()}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-disabled={local.disabled}
        aria-labelledby={local.ariaLabelledby}
        onClick={(event) => {
          if (local.disabled) return
          const target = event.target
          if (target instanceof HTMLElement) {
            if (target.dataset.selectChip === "true") return
            if (target.dataset.selectInput === "true" || target.closest('[data-select-input="true"]')) {
              setOpen(true)
              return
            }
          }
          if (local.allowInput && inputRef) {
            inputRef.focus()
            setOpen(true)
          } else {
            setOpen(!open())
          }
        }}
        onKeyDown={handleContainerKeyDown}
      >
        <Show
          when={hasSelections()}
          fallback={
            <Show
              when={local.allowInput}
              fallback={<span class="flex-1 truncate text-text-muted">{local.placeholder || "Select..."}</span>}
            >
              <input
                data-select-input="true"
                ref={(element) => (inputRef = element)}
                type="text"
                value={inputValue()}
                onInput={(event) => handleInputChange(event.currentTarget.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                placeholder={local.placeholder || "Type or select..."}
                disabled={local.disabled}
                class="flex-1 bg-transparent text-xs outline-none placeholder:text-text-muted"
                autocomplete="off"
              />
            </Show>
          }
        >
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <For each={selectedOptions()}>
              {(option) => (
                <div
                  class="flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-text transition-colors hover:bg-surface-emphasis"
                  data-select-chip="true"
                >
                  <Show when={option.color}>
                    {(color) => <span class="h-2 w-2 shrink-0 rounded-full" style={{ background: color() }} />}
                  </Show>
                  <Show when={!option.color}>
                    <Show when={option.icon} keyed>
                      {(Icon) => <Icon class="h-3 w-3 shrink-0 text-text-muted" />}
                    </Show>
                  </Show>
                  <span class="truncate">{option.label || "\u00A0"}</span>
                  <button
                    type="button"
                    class="rounded p-0.5 text-text-muted transition-colors hover:text-text"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRemoveValue(option.value)
                    }}
                    disabled={local.disabled}
                    aria-label="Remove"
                  >
                    <X class="h-3 w-3 shrink-0" weight="bold" />
                  </button>
                </div>
              )}
            </For>
            <Show when={local.allowInput}>
              <input
                data-select-input="true"
                ref={(element) => (inputRef = element)}
                type="text"
                value={inputValue()}
                onInput={(event) => handleInputChange(event.currentTarget.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                placeholder={hasSelections() ? "" : local.placeholder || "Type or select..."}
                disabled={local.disabled}
                class="flex-1 min-w-[60px] bg-transparent text-xs outline-none placeholder:text-text-muted"
                autocomplete="off"
              />
            </Show>
          </div>
        </Show>
        <div class="flex shrink-0 items-center">
          <span
            class="inline-flex transition-transform duration-150"
            style={{ transform: open() ? "rotate(180deg)" : "rotate(0deg)" }}
            aria-hidden="true"
          >
            <CaretDown class="h-3.5 w-3.5 text-text-muted" />
          </span>
        </div>
      </div>

      <Show when={open()}>
        <div
          class="absolute left-0 top-full z-1010 mt-1 max-h-80 min-w-full overflow-hidden rounded border border-border bg-surface-floating shadow-lg"
          data-select-menu
          role="listbox"
          aria-multiselectable="true"
          id={listboxId}
        >
          <Show when={local.searchable && !local.allowInput}>
            <div class="border-b border-border p-2">
              <input
                type="text"
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search..."
                class="h-7 w-full rounded border border-border bg-surface-elevated px-2 text-xs outline-none focus-visible:border-accent"
                onClick={(event) => event.stopPropagation()}
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
                  const isSelected = () => selectedValues().some((value) => value === option.value)
                  return (
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-muted disabled:opacity-40"
                      classList={{ "bg-surface-muted": isSelected() }}
                      onClick={() => toggleOption(option)}
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
                        {local.renderOption!(option, isSelected())}
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
      </Show>
    </div>
  )
}
