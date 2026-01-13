import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

type SpinnerSize = "xs" | "sm" | "default" | "lg"

interface SpinnerProps extends ComponentProps<"div"> {
  size?: SpinnerSize
}

const sizeStyles: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-[1.5px]",
  default: "h-5 w-5 border-2",
  lg: "h-6 w-6 border-2",
}

export function Spinner(props: SpinnerProps) {
  const [local, rest] = splitProps(props, ["class", "size"])
  const size = local.size ?? "default"
  const base = "animate-spin rounded-full border-text-muted border-t-transparent"
  const sizeClass = sizeStyles[size]
  const merged = local.class ? `${base} ${sizeClass} ${local.class}` : `${base} ${sizeClass}`

  return <div {...rest} class={merged} role="status" aria-label="Loading" />
}
