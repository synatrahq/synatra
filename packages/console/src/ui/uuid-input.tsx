import { getOwner, runWithOwner } from "solid-js"
import { ArrowsClockwise } from "phosphor-solid-js"

type UuidInputProps = {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
}

function generateUUID(): string {
  return crypto.randomUUID()
}

export function UuidInput(props: UuidInputProps) {
  const owner = getOwner()
  const base =
    "h-7 w-full rounded bg-surface-elevated pl-2 pr-8 text-xs leading-tight text-text font-mono transition-colors duration-100 outline-none disabled:opacity-40"
  const border = () =>
    props.hasError
      ? "border border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_1px_var(--color-danger)]"
      : "border border-border focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)]"

  const handleChange = (value: string) => {
    queueMicrotask(() => runWithOwner(owner, () => props.onChange?.(value)))
  }

  const handleGenerate = () => {
    handleChange(generateUUID())
  }

  return (
    <div class="relative flex w-full">
      <input
        type="text"
        autocomplete="off"
        value={props.value ?? ""}
        onInput={(e) => handleChange(e.currentTarget.value)}
        onBlur={() => props.onBlur?.()}
        placeholder={props.placeholder ?? "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
        disabled={props.disabled}
        class={`${base} ${border()}`}
      />
      <button
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
        onClick={handleGenerate}
        disabled={props.disabled}
        title="Generate UUID"
      >
        <ArrowsClockwise class="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
