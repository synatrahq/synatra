import { Switch, Match } from "solid-js"
import type { OutputItem } from "../../app/api"
import { TableOutput } from "./table-output"
import { ChartOutput } from "./chart-output"
import { MarkdownOutput } from "./markdown-output"
import { KeyValueOutput } from "./key-value-output"

export { TableOutput } from "./table-output"
export { ChartOutput } from "./chart-output"
export { MarkdownOutput } from "./markdown-output"
export { KeyValueOutput } from "./key-value-output"

type OutputItemRendererProps = {
  item: OutputItem
  compact?: boolean
}

export function OutputItemRenderer(props: OutputItemRendererProps) {
  return (
    <Switch fallback={<div class="text-2xs text-text-muted">Unknown output type: {props.item.kind}</div>}>
      <Match when={props.item.kind === "table"}>
        <TableOutput item={props.item} compact={props.compact} />
      </Match>
      <Match when={props.item.kind === "chart"}>
        <ChartOutput item={props.item} compact={props.compact} />
      </Match>
      <Match when={props.item.kind === "markdown"}>
        <MarkdownOutput item={props.item} compact={props.compact} />
      </Match>
      <Match when={props.item.kind === "key_value"}>
        <KeyValueOutput item={props.item} compact={props.compact} />
      </Match>
    </Switch>
  )
}
