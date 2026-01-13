import { Show } from "solid-js"
import { Markdown } from "../../ui"
import type { OutputItem } from "../../app/api"

type MarkdownPayload = {
  content: string
}

type MarkdownOutputProps = {
  item: OutputItem
  compact?: boolean
}

export function MarkdownOutput(props: MarkdownOutputProps) {
  const payload = () => props.item.payload as MarkdownPayload
  const content = () => payload()?.content ?? ""

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
        <Markdown class={props.compact ? "text-2xs text-text" : "text-xs text-text"}>{content()}</Markdown>
      </div>
    </div>
  )
}
