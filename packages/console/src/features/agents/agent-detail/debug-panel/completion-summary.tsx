import { Badge, Markdown } from "../../../../ui"

export function CompletionSummary(props: { summary: string }) {
  return (
    <div class="rounded border border-success/50 bg-success/5 p-1.5">
      <div class="flex items-center gap-1 mb-1">
        <Badge variant="success" class="text-2xs">
          Completed
        </Badge>
      </div>
      <Markdown class="text-2xs text-text">{props.summary}</Markdown>
    </div>
  )
}
