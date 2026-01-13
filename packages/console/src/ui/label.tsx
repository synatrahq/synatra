import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

type LabelProps = ComponentProps<"label">

export function Label(props: LabelProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const base = "text-xs font-medium leading-tight text-text"
  const merged = local.class ? `${base} ${local.class}` : base
  return (
    <label {...rest} class={merged}>
      {local.children}
    </label>
  )
}
