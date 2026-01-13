import { For, Show, splitProps, createUniqueId, children } from "solid-js"
import type { JSX } from "solid-js"
import { Check } from "phosphor-solid-js"

export type CheckboxOption = {
  value: string
  label: string
  description?: string
}

export type CheckboxGroupProps = {
  value: string[]
  options: CheckboxOption[]
  onChange?: (value: string[]) => void
  disabled?: boolean
  class?: string
  otherOption?: {
    label?: string
    value: string
    selected: boolean
    onToggle: () => void
    children?: JSX.Element
  }
}

export function CheckboxGroup(props: CheckboxGroupProps) {
  const [local] = splitProps(props, ["value", "options", "onChange", "disabled", "class", "otherOption"])

  const toggle = (optionValue: string) => {
    const current = local.value ?? []
    const next = current.includes(optionValue) ? current.filter((v) => v !== optionValue) : [...current, optionValue]
    local.onChange?.(next)
  }

  return (
    <div class={`flex flex-col gap-1 ${local.class ?? ""}`} role="group">
      <For each={local.options}>
        {(option) => {
          const isChecked = () => (local.value ?? []).includes(option.value)
          const id = createUniqueId()

          return (
            <label
              for={id}
              class="flex cursor-pointer items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors"
              classList={{
                "bg-accent/10": isChecked(),
                "hover:bg-surface-muted/50": !isChecked(),
                "cursor-not-allowed opacity-40": local.disabled,
              }}
            >
              <div class="relative inline-flex items-center justify-center">
                <input
                  id={id}
                  type="checkbox"
                  checked={isChecked()}
                  disabled={local.disabled}
                  onChange={() => toggle(option.value)}
                  class="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-border bg-surface-elevated transition-all duration-100 hover:border-accent checked:border-(--color-accent) checked:bg-(--color-accent)"
                />
                <Check
                  class="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 text-text-inverse transition-transform duration-100 peer-checked:scale-100"
                  weight="bold"
                />
              </div>
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
                  "bg-accent/10": other().selected,
                  "hover:bg-surface-muted/50": !other().selected,
                  "cursor-not-allowed opacity-40": local.disabled,
                }}
              >
                <div class="relative inline-flex items-center justify-center">
                  <input
                    id={id}
                    type="checkbox"
                    checked={other().selected}
                    disabled={local.disabled}
                    onChange={() => other().onToggle()}
                    class="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-border bg-surface-elevated transition-all duration-100 hover:border-accent checked:border-(--color-accent) checked:bg-(--color-accent)"
                  />
                  <Check
                    class="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 text-text-inverse transition-transform duration-100 peer-checked:scale-100"
                    weight="bold"
                  />
                </div>
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
