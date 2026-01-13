import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

interface SwitchProps extends ComponentProps<"button"> {
  checked: boolean
  hasError?: boolean
}

export function Switch(props: SwitchProps) {
  const [local, rest] = splitProps(props, ["checked", "class", "type", "hasError"])
  const base =
    "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-all duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 disabled:opacity-40"
  const border = () =>
    local.hasError ? "border-danger focus-visible:ring-danger" : "border-transparent focus-visible:ring-accent"
  const merged = () => `${base} ${border()}${local.class ? ` ${local.class}` : ""}`
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={local.checked}
      class={merged()}
      classList={{
        "bg-accent": local.checked,
        "bg-switch-track": !local.checked,
      }}
    >
      <span
        class="pointer-events-none inline-block h-4 w-4 rounded-full bg-control-handle transition-all duration-100 transform"
        classList={{
          "translate-x-4": local.checked,
          "translate-x-0": !local.checked,
        }}
      />
    </button>
  )
}
