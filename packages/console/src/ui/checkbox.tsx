import { splitProps, createEffect, Show, type JSX } from "solid-js"
import type { ComponentProps } from "solid-js"
import { Check, Minus } from "phosphor-solid-js"

interface CheckboxProps extends Omit<ComponentProps<"input">, "children"> {
  indeterminate?: boolean
  label?: JSX.Element
  labelClass?: string
  hasError?: boolean
}

export function Checkbox(props: CheckboxProps) {
  let inputRef: HTMLInputElement | undefined

  const [local, rest] = splitProps(props, ["class", "indeterminate", "label", "labelClass", "hasError"])

  createEffect(() => {
    const element = inputRef
    if (!element) return
    element.indeterminate = local.indeterminate ?? false
  })

  const base =
    "peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border bg-surface-elevated transition-all duration-100 hover:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 checked:border-(--color-accent) checked:bg-(--color-accent) checked:hover:border-(--color-accent-hover) checked:hover:bg-(--color-accent-hover) indeterminate:border-(--color-accent) indeterminate:bg-(--color-accent) indeterminate:hover:border-(--color-accent-hover) indeterminate:hover:bg-(--color-accent-hover)"
  const border = () =>
    local.hasError ? "border-danger focus-visible:ring-danger" : "border-border focus-visible:ring-accent"
  const merged = () => `${base} ${border()}${local.class ? ` ${local.class}` : ""}`

  const checkbox = (
    <div class="relative inline-flex items-center justify-center">
      <input {...rest} ref={inputRef} type="checkbox" class={merged()} />
      <Check
        class="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 text-text-inverse transition-transform duration-100 peer-checked:scale-100"
        weight="bold"
        aria-hidden="true"
      />
      <Minus
        class="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 text-text-inverse transition-transform duration-100 peer-indeterminate:scale-100"
        weight="bold"
        aria-hidden="true"
      />
    </div>
  )

  return (
    <Show when={local.label} fallback={checkbox}>
      <label class="inline-flex cursor-pointer items-center gap-1.5">
        {checkbox}
        <span class={local.labelClass ?? "text-xs font-medium leading-tight text-text"}>{local.label}</span>
      </label>
    </Show>
  )
}
