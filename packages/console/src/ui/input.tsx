import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

type InputProps = ComponentProps<"input"> & {
  hasError?: boolean
}

export function Input(props: InputProps) {
  const [local, rest] = splitProps(props, ["class", "hasError"])
  const base =
    "h-7 w-full rounded bg-surface-elevated px-2 py-1 text-xs leading-tight text-text transition-colors duration-100 outline-none disabled:opacity-40"
  const border = () =>
    local.hasError
      ? "border border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_1px_var(--color-danger)]"
      : "border border-border focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)]"
  return <input autocomplete="off" {...rest} class={`${base} ${border()}${local.class ? ` ${local.class}` : ""}`} />
}
