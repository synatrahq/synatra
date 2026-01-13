import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

type ButtonVariant = "default" | "secondary" | "ghost" | "destructive" | "outline"
type ButtonSize = "default" | "sm" | "xs"

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-accent text-text-inverse hover:bg-accent-hover",
  secondary: "bg-surface-muted text-text hover:bg-surface",
  ghost: "bg-transparent text-text hover:bg-surface-muted",
  outline: "bg-transparent border border-border text-text hover:bg-surface-muted",
  destructive: "bg-danger text-text-inverse hover:bg-danger-hover focus-visible:ring-danger",
}

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-7 px-2 text-xs",
  sm: "h-6 px-2.5 text-2xs",
  xs: "h-5 px-1.5 text-[10px]",
}

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "size", "children"])
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded font-medium leading-tight transition-all duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40"
  const variant = variantStyles[local.variant ?? "default"]
  const size = sizeStyles[local.size ?? "default"]
  return (
    <button {...rest} class={`${base} ${size} ${variant}${local.class ? ` ${local.class}` : ""}`}>
      {local.children}
    </button>
  )
}
