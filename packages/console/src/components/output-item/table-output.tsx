import { Show, For, Index } from "solid-js"
import type { OutputItem } from "../../app/api"
import { TablePagination } from "../../ui"

type TablePayload = {
  columns: Array<{ key: string; label: string }>
  data: Array<Record<string, unknown>>
}

type TableOutputProps = {
  item: OutputItem
  compact?: boolean
}

export function TableOutput(props: TableOutputProps) {
  const payload = () => props.item.payload as TablePayload
  const columns = () => payload().columns ?? []
  const data = () => payload().data ?? []

  return (
    <div class={props.compact ? "space-y-1.5" : "space-y-3"}>
      <Show when={props.item.name && !props.compact}>
        <h4 class="text-sm font-medium text-text">{props.item.name}</h4>
      </Show>

      <div
        class={
          props.compact
            ? "rounded border border-border overflow-x-auto"
            : "rounded-lg border border-border overflow-x-auto"
        }
      >
        <TablePagination data={data()}>
          {(rows, info) => (
            <table class={props.compact ? "w-full text-2xs" : "w-full text-xs"}>
              <thead class="bg-surface-muted">
                <tr>
                  <For each={columns()}>
                    {(column) => <th class="px-3 py-2 text-left text-text-muted font-medium">{column.label}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <Show when={rows.length === 0}>
                  <tr>
                    <td colspan={columns().length} class="px-3 py-4 text-center text-text-muted text-2xs">
                      No data available
                    </td>
                  </tr>
                </Show>
                <For each={rows}>
                  {(row, index) => (
                    <tr class={index() > 0 ? "border-t border-border" : ""}>
                      <For each={columns()}>
                        {(column) => <td class="px-3 py-2 text-text">{String(row[column.key] ?? "")}</td>}
                      </For>
                    </tr>
                  )}
                </For>
                <Index each={Array(info.padRows)}>
                  {() => (
                    <tr class="border-t border-transparent">
                      <For each={columns()}>{() => <td class="px-3 py-2">&nbsp;</td>}</For>
                    </tr>
                  )}
                </Index>
              </tbody>
            </table>
          )}
        </TablePagination>
      </div>
    </div>
  )
}
