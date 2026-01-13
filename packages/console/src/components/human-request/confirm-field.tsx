import { Show } from "solid-js"
import { RadioGroup, Textarea } from "../../ui"
import { Warning, Info, WarningOctagon } from "phosphor-solid-js"
import type { HumanRequestConfirmConfig } from "@synatra/core/types"

type ConfirmFieldProps = {
  config: HumanRequestConfirmConfig & { key: string }
  value: { confirmed: boolean; reason?: string } | null
  onChange: (value: { confirmed: boolean; reason?: string }) => void
  message?: string
}

export function ConfirmField(props: ConfirmFieldProps) {
  const confirmLabel = () => props.config.confirmLabel ?? "Confirm"
  const rejectLabel = () => props.config.rejectLabel ?? "Reject"
  const selection = () => props.value?.confirmed
  const variant = () => props.config.variant ?? "info"

  const radioValue = () => {
    if (selection() === true) return "confirm"
    if (selection() === false) return "reject"
    return undefined
  }

  const options = () => [
    { value: "confirm", label: confirmLabel(), color: "success" as const },
    { value: "reject", label: rejectLabel(), color: "danger" as const },
  ]

  const handleChange = (value: string) => {
    if (value === "confirm") {
      props.onChange({ confirmed: true })
      return
    }
    props.onChange({ confirmed: false, reason: props.value?.reason })
  }

  const borderColor = () => {
    switch (variant()) {
      case "danger":
        return "border-danger/50"
      case "warning":
        return "border-warning/50"
      default:
        return "border-accent/50"
    }
  }

  const bgColor = () => {
    switch (variant()) {
      case "danger":
        return "bg-danger/5"
      case "warning":
        return "bg-warning/5"
      default:
        return "bg-accent/5"
    }
  }

  const iconColor = () => {
    switch (variant()) {
      case "danger":
        return "text-danger"
      case "warning":
        return "text-warning"
      default:
        return "text-accent"
    }
  }

  const Icon = () => {
    switch (variant()) {
      case "danger":
        return <WarningOctagon class={`h-5 w-5 ${iconColor()}`} weight="fill" />
      case "warning":
        return <Warning class={`h-5 w-5 ${iconColor()}`} weight="fill" />
      default:
        return <Info class={`h-5 w-5 ${iconColor()}`} weight="fill" />
    }
  }

  return (
    <div class={`rounded-lg border p-3 space-y-3 ${borderColor()} ${bgColor()}`}>
      <Show when={props.message}>
        <div class="flex items-start gap-2">
          <Icon />
          <p class="text-xs text-text flex-1">{props.message}</p>
        </div>
      </Show>

      <div class="space-y-1">
        <RadioGroup value={radioValue()} options={options()} onChange={handleChange} />
        <Show when={selection() === false}>
          <Textarea
            placeholder="Reason or feedback (optional)"
            rows={2}
            value={props.value?.reason ?? ""}
            onInput={(e) => props.onChange({ confirmed: false, reason: e.currentTarget.value })}
            class="text-xs mt-1"
          />
        </Show>
      </div>
    </div>
  )
}
