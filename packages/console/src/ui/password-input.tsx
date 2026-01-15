import { createSignal } from "solid-js"
import { Eye, EyeSlash } from "phosphor-solid-js"

type PasswordInputProps = {
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

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = createSignal(false)
  const base =
    "h-7 w-full rounded bg-surface-elevated pl-2 pr-8 text-xs leading-tight text-text transition-colors duration-100 outline-none disabled:opacity-40"
  const border = () =>
    props.hasError
      ? "border border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_1px_var(--color-danger)]"
      : "border border-border focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)]"

  return (
    <div class="relative flex w-full">
      <input
        type={visible() ? "text" : "password"}
        autocomplete="off"
        value={props.value ?? ""}
        onInput={(e) => props.onChange?.(e.currentTarget.value)}
        onBlur={() => props.onBlur?.()}
        placeholder={props.placeholder ?? "Enter password"}
        disabled={props.disabled}
        minLength={props.minLength}
        maxLength={props.maxLength}
        pattern={props.pattern}
        class={`${base} ${border()}`}
      />
      <button
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
        onClick={() => setVisible(!visible())}
        tabIndex={-1}
      >
        {visible() ? <EyeSlash class="h-3.5 w-3.5" /> : <Eye class="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
