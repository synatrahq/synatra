import { Show, For, createSignal } from "solid-js"
import { X, Plus } from "phosphor-solid-js"
import type { LlmProvider } from "@synatra/core/types"
import { Input, IconButton } from "../../../../ui"
import { theme } from "../../../../app"
import { PROVIDER_ICONS } from "./constants"

const MASK = "••••••••"

export function SensitiveInput(props: {
  type?: "text" | "password"
  value: string | undefined
  hasSaved: boolean
  placeholder?: string
  onChange: (value: string | undefined) => void
  class?: string
}) {
  const [editing, setEditing] = createSignal(false)

  const displayValue = () => {
    if (editing()) return props.value ?? ""
    if (props.value !== undefined) return props.value
    if (props.hasSaved) return MASK
    return ""
  }

  const handleFocus = () => {
    setEditing(true)
  }

  const handleBlur = (e: FocusEvent) => {
    const val = (e.target as HTMLInputElement).value
    setEditing(false)
    if (val === "" && props.hasSaved) {
      props.onChange(undefined)
    }
  }

  const handleInput = (e: InputEvent) => {
    props.onChange((e.target as HTMLInputElement).value)
  }

  return (
    <Input
      type={props.type ?? "text"}
      value={displayValue()}
      placeholder={props.placeholder}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onInput={handleInput}
      class={props.class}
    />
  )
}

export function KeyValueList(props: {
  items: Array<{ key: string; value: string }>
  onChange: (items: Array<{ key: string; value: string }>) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}) {
  const items = () => (props.items.length === 0 ? [{ key: "", value: "" }] : props.items)

  const handleAdd = () => {
    props.onChange([...items(), { key: "", value: "" }])
  }

  const handleRemove = (index: number) => {
    const newItems = items().filter((_, i) => i !== index)
    props.onChange(newItems.length === 0 ? [{ key: "", value: "" }] : newItems)
  }

  const handleChange = (index: number, field: "key" | "value", value: string) => {
    props.onChange(items().map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  return (
    <div class="flex flex-col gap-1.5">
      <For each={items()}>
        {(item, index) => (
          <div class="group flex items-center gap-1.5">
            <Input
              type="text"
              value={item.key}
              placeholder={props.keyPlaceholder ?? "Key"}
              onInput={(e) => handleChange(index(), "key", e.currentTarget.value)}
              class="flex-1 font-code text-xs"
            />
            <Input
              type="text"
              value={item.value}
              placeholder={props.valuePlaceholder ?? "Value"}
              onInput={(e) => handleChange(index(), "value", e.currentTarget.value)}
              class="flex-1 font-code text-xs"
            />
            <IconButton
              variant="ghost"
              size="sm"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleRemove(index())}
            >
              <X class="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
      </For>
      <button
        type="button"
        class="flex items-center gap-1 self-start text-xs text-text-muted transition-colors hover:text-text"
        onClick={handleAdd}
      >
        <Plus class="h-3 w-3" />
        Add
      </button>
    </div>
  )
}

export function ProviderIcon(props: { provider: LlmProvider; class?: string }) {
  const icon = PROVIDER_ICONS[props.provider]
  return <img src={theme() === "dark" ? icon.dark : icon.light} alt="" class={props.class ?? icon.size} />
}
