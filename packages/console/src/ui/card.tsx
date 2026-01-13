import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

type CardProps = ComponentProps<"div">

export function Card(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const base = "min-w-0 rounded border border-border bg-surface-elevated"
  const merged = local.class ? `${base} ${local.class}` : base
  return (
    <div {...rest} class={merged}>
      {local.children}
    </div>
  )
}

export function CardHeader(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const base = "flex flex-col gap-1 border-b border-border px-3 py-2"
  const merged = local.class ? `${base} ${local.class}` : base
  return (
    <div {...rest} class={merged}>
      {local.children}
    </div>
  )
}

export function CardTitle(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const base = "text-[15px] font-semibold leading-tight text-text"
  const merged = local.class ? `${base} ${local.class}` : base
  return (
    <div {...rest} class={merged}>
      {local.children}
    </div>
  )
}

export function CardDescription(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const base = "text-xs leading-tight text-text-muted"
  const merged = local.class ? `${base} ${local.class}` : base
  return (
    <div {...rest} class={merged}>
      {local.children}
    </div>
  )
}

export function CardContent(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const base = "px-3 py-3"
  const merged = local.class ? `${base} ${local.class}` : base
  return (
    <div {...rest} class={merged}>
      {local.children}
    </div>
  )
}

export function CardFooter(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const base = "px-3 pb-3"
  const merged = local.class ? `${base} ${local.class}` : base
  return (
    <div {...rest} class={merged}>
      {local.children}
    </div>
  )
}
