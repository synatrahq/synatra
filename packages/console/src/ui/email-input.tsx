import { Envelope } from "phosphor-solid-js"

type EmailInputProps = {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
  minLength?: number
  maxLength?: number
  pattern?: string
}

export function EmailInput(props: EmailInputProps) {
  const base =
    "h-7 w-full rounded bg-surface-elevated pl-8 pr-2 text-xs leading-tight text-text transition-colors duration-100 outline-none disabled:opacity-40"
  const border = () =>
    props.hasError
      ? "border border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_1px_var(--color-danger)]"
      : "border border-border focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)]"

  return (
    <div class="relative flex w-full">
      <span class="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
        <Envelope class="h-3.5 w-3.5" />
      </span>
      <input
        type="email"
        autocomplete="off"
        value={props.value ?? ""}
        onInput={(e) => props.onChange?.(e.currentTarget.value)}
        onBlur={() => props.onBlur?.()}
        placeholder={props.placeholder ?? "email@example.com"}
        disabled={props.disabled}
        minLength={props.minLength}
        maxLength={props.maxLength}
        pattern={props.pattern}
        class={`${base} ${border()}`}
      />
    </div>
  )
}
