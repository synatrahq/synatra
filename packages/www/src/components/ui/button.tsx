import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

type ButtonVariant = "default" | "outline"

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant
  size?: "xs"
}

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-emerald-600 text-white",
  outline: "bg-transparent border border-gray-600 text-gray-400",
}

const BASE = "inline-flex items-center justify-center gap-1.5 rounded font-medium h-5 px-1.5 text-[10px]"

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "size", "children"])
  const cls = `${BASE} ${VARIANTS[local.variant ?? "default"]}${local.class ? ` ${local.class}` : ""}`
  return (
    <button {...rest} class={cls}>
      {local.children}
    </button>
  )
}
