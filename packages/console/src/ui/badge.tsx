import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success"
  | "warning"
  | "important"
  | "personal"
  | "updates"
  | "promotions"
  | "forums"

interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-accent-soft text-accent",
  secondary: "bg-surface-muted text-text-muted",
  outline: "border border-border bg-transparent text-text-muted",
  destructive: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  // Category variants (Mail-0 inspired)
  important: "bg-transparent text-important",
  personal: "bg-transparent text-personal",
  updates: "bg-transparent text-updates",
  promotions: "bg-transparent text-promotions",
  forums: "bg-transparent text-forums",
}

export function Badge(props: BadgeProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "children"])
  const variant = local.variant ?? "default"
  const base = "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors"
  const styles = variantStyles[variant]
  const merged = local.class ? `${base} ${styles} ${local.class}` : `${base} ${styles}`

  return (
    <span {...rest} class={merged}>
      {local.children}
    </span>
  )
}
