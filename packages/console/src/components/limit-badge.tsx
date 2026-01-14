import { createMemo } from "solid-js"

type LimitBadgeProps = {
  current: number
  limit: number | null
  label: string
}

export function LimitBadge(props: LimitBadgeProps) {
  const pct = createMemo(() => (props.limit === null ? 0 : (props.current / props.limit) * 100))

  const variant = createMemo(() => {
    if (pct() > 100) return "danger"
    if (pct() === 100) return "neutral"
    if (pct() >= 80) return "warning"
    return "success"
  })

  const text = createMemo(() => {
    if (props.limit === null) return `${props.current} ${props.label}`
    return `${props.current}/${props.limit} ${props.label}`
  })

  return (
    <span
      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium"
      classList={{
        "bg-success-soft text-success": variant() === "success",
        "bg-warning-soft text-warning": variant() === "warning",
        "bg-danger-soft text-danger": variant() === "danger",
        "bg-surface-muted text-text-muted": variant() === "neutral",
      }}
    >
      {text()}
    </span>
  )
}
