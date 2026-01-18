import { Show, type JSX } from "solid-js"

type FormFieldProps = {
  label?: string
  for?: string
  error?: string
  description?: string
  required?: boolean
  horizontal?: boolean
  labelWidth?: string
  align?: "start" | "center"
  children: JSX.Element
}

export function FormField(props: FormFieldProps) {
  const label = (
    <Show when={props.label}>
      <label
        for={props.for}
        class="shrink-0 text-xs text-text-muted"
        classList={{ "font-medium text-text": !props.horizontal, "pt-1.5": props.align === "start" }}
        style={props.labelWidth ? { width: props.labelWidth } : undefined}
      >
        {props.label}
        <Show when={props.required}>
          <span class="text-danger"> *</span>
        </Show>
      </label>
    </Show>
  )

  const feedback = (
    <>
      <Show when={props.description && !props.error}>
        <span class="text-2xs text-text-muted">{props.description}</span>
      </Show>
      <Show when={props.error}>
        <span class="text-2xs text-danger">{props.error}</span>
      </Show>
    </>
  )

  if (props.horizontal) {
    return (
      <div
        class="flex gap-3"
        classList={{ "items-start": props.align === "start", "items-center": props.align !== "start" }}
      >
        {label}
        <div class="flex flex-1 flex-col gap-1">
          {props.children}
          {feedback}
        </div>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-1.5">
      {label}
      {props.children}
      {feedback}
    </div>
  )
}
