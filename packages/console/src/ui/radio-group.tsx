import { For, Show, splitProps, createUniqueId, children } from "solid-js"
import type { JSX } from "solid-js"

export type RadioColor = "accent" | "success" | "danger" | "warning"

export type RadioOption = {
  value: string
  label: string
  description?: string
  color?: RadioColor
}

export type RadioGroupProps = {
  value?: string
  options: RadioOption[]
  onChange?: (value: string) => void
  disabled?: boolean
  class?: string
  color?: RadioColor
  otherOption?: {
    label?: string
    value: string
    selected: boolean
    onSelect: () => void
    children?: JSX.Element
  }
}

const colorClasses: Record<RadioColor, { selected: string; bg: string }> = {
  accent: { selected: "border-transparent bg-accent", bg: "bg-accent/10" },
  success: { selected: "border-transparent bg-success", bg: "bg-success/10" },
  danger: { selected: "border-transparent bg-danger", bg: "bg-danger/10" },
  warning: { selected: "border-transparent bg-warning", bg: "bg-warning/10" },
}

export function RadioGroup(props: RadioGroupProps) {
  const [local] = splitProps(props, ["value", "options", "onChange", "disabled", "class", "color", "otherOption"])

  const name = createUniqueId()

  const getColor = (option: RadioOption) => option.color ?? local.color ?? "accent"
  const defaultClasses = colorClasses.accent

  return (
    <div class={`flex flex-col gap-1 ${local.class ?? ""}`} role="radiogroup">
      <For each={local.options}>
        {(option) => {
          const isSelected = () => local.value === option.value
          const id = createUniqueId()
          const color = () => getColor(option)
          const classes = () => colorClasses[color()]

          return (
            <label
              for={id}
              class="flex cursor-pointer items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors"
              classList={{
                [classes().bg]: isSelected(),
                "hover:bg-surface-muted/50": !isSelected(),
                "cursor-not-allowed opacity-40": local.disabled,
              }}
            >
              <span
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-100"
                classList={{
                  "border-border bg-surface-elevated hover:border-accent": !isSelected(),
                  [classes().selected]: isSelected(),
                }}
              >
                <span
                  class="h-1.5 w-1.5 rounded-full bg-white transition-transform duration-100"
                  classList={{ "scale-100": isSelected(), "scale-0": !isSelected() }}
                />
              </span>
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={isSelected()}
                disabled={local.disabled}
                onChange={() => local.onChange?.(option.value)}
                class="hidden"
              />
              <div class="flex-1 min-w-0">
                <span class="text-text">{option.label}</span>
                <Show when={option.description}>
                  <p class="text-2xs text-text-muted">{option.description}</p>
                </Show>
              </div>
            </label>
          )
        }}
      </For>
      <Show when={local.otherOption}>
        {(other) => {
          const id = createUniqueId()
          const resolved = children(() => other().children)
          return (
            <>
              <label
                for={id}
                class="flex cursor-pointer items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors"
                classList={{
                  [defaultClasses.bg]: other().selected,
                  "hover:bg-surface-muted/50": !other().selected,
                  "cursor-not-allowed opacity-40": local.disabled,
                }}
              >
                <span
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-100"
                  classList={{
                    "border-border bg-surface-elevated hover:border-accent": !other().selected,
                    [defaultClasses.selected]: other().selected,
                  }}
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full bg-white transition-transform duration-100"
                    classList={{ "scale-100": other().selected, "scale-0": !other().selected }}
                  />
                </span>
                <input
                  id={id}
                  type="radio"
                  name={name}
                  value={other().value}
                  checked={other().selected}
                  disabled={local.disabled}
                  onChange={() => other().onSelect()}
                  class="hidden"
                />
                <span class="text-text">{other().label ?? "Other"}</span>
              </label>
              <Show when={other().selected}>{resolved()}</Show>
            </>
          )
        }}
      </Show>
    </div>
  )
}
