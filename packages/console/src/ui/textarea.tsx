import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

type TextareaProps = ComponentProps<"textarea"> & {
  hasError?: boolean
  variant?: "elevated" | "surface"
}

export function Textarea(props: TextareaProps) {
  const [local, rest] = splitProps(props, ["class", "rows", "hasError", "variant"])
  const bg = () => (local.variant === "surface" ? "bg-surface" : "bg-surface-elevated")
  const base = () =>
    `w-full rounded ${bg()} px-2 py-1.5 text-xs leading-tight text-text outline-none transition-all duration-100 disabled:opacity-40`
  const border = () =>
    local.hasError
      ? "shadow-[inset_0_0_0_1px_var(--color-danger)]"
      : "shadow-[inset_0_0_0_1px_var(--color-border)] focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent),0_0_0_1px_var(--color-accent)]"
  return (
    <textarea
      autocomplete="off"
      {...rest}
      rows={typeof local.rows === "number" && local.rows > 0 ? local.rows : 6}
      class={`${base()} ${border()}${local.class ? ` ${local.class}` : ""}`}
    />
  )
}
