import { Show } from "solid-js"
import type { OutputItem } from "../../app/api"

type TextPayload = {
  content: string
}

type TextOutputProps = {
  item: OutputItem
  compact?: boolean
}

export function TextOutput(props: TextOutputProps) {
  const payload = () => props.item.payload as TextPayload

  return (
    <div class={props.compact ? "space-y-1" : "space-y-2"}>
      <Show when={props.item.name && !props.compact}>
        <h4 class="text-sm font-medium text-text">{props.item.name}</h4>
      </Show>
      <div
        class={
          props.compact
            ? "rounded border border-border bg-surface p-2"
            : "rounded-lg border border-border bg-surface p-3"
        }
      >
        <p class={props.compact ? "text-2xs text-text whitespace-pre-wrap" : "text-xs text-text whitespace-pre-wrap"}>
          {payload().content}
        </p>
      </div>
    </div>
  )
}
