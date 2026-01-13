import { splitProps } from "solid-js"
import type { ComponentProps, JSX } from "solid-js"

type IconButtonVariant = "outline" | "ghost"
type IconButtonSize = "xs" | "sm" | "md"

interface IconButtonProps extends ComponentProps<"button"> {
  variant?: IconButtonVariant
  size?: IconButtonSize
  children: JSX.Element
}

export function IconButton(props: IconButtonProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "size", "children"])
  const variant = local.variant ?? "ghost"
  const size = local.size ?? "md"

  const base =
    "inline-flex shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40"

  const sizeStyles = {
    xs: "h-5 w-5",
    sm: "h-6 w-6",
    md: "h-7 w-7",
  }[size]

  const variantStyles = {
    outline: "border border-border bg-surface-elevated text-text-muted hover:border-accent hover:text-text",
    ghost: "text-text-muted hover:bg-surface-muted hover:text-text",
  }[variant]

  const className = local.class
    ? `${base} ${sizeStyles} ${variantStyles} ${local.class}`
    : `${base} ${sizeStyles} ${variantStyles}`

  return (
    <button type="button" {...rest} class={className}>
      {local.children}
    </button>
  )
}
