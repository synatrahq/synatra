import { For } from "solid-js"
import type { OutputItem } from "../../app/api"
import { OutputItemRenderer } from "./index"
import { Badge } from "../../ui"

type BatchOutputProps = {
  items: OutputItem[]
}

export function BatchOutput(props: BatchOutputProps) {
  return (
    <div class="rounded-lg border border-border bg-surface p-3 space-y-3">
      <div class="flex items-center gap-1.5">
        <Badge variant="secondary" class="text-2xs">
          Batch Output
        </Badge>
        <span class="text-2xs text-text-muted">{props.items.length} items</span>
      </div>
      <div class="space-y-2">
        <For each={props.items}>{(item) => <OutputItemRenderer item={item} compact />}</For>
      </div>
    </div>
  )
}
