import { Show, For, Index } from "solid-js"
import { Checkbox, TablePagination } from "../../ui"
import type { HumanRequestSelectRowsConfig } from "@synatra/core/types"

type SelectRowsFieldProps = {
  config: HumanRequestSelectRowsConfig & { key: string }
  value: number[]
  onChange: (value: number[]) => void
}

export function SelectRowsField(props: SelectRowsFieldProps) {
  const data = () => props.config.data ?? []
  const columns = () => props.config.columns ?? []
  const isMulti = () => props.config.selectionMode === "multiple"
  const selected = () => new Set(props.value)

  const toggleRow = (index: number) => {
    const next = new Set(props.value)
    if (next.has(index)) {
      next.delete(index)
    } else {
      if (!isMulti()) {
        next.clear()
      }
      next.add(index)
    }
    props.onChange(Array.from(next))
  }

  const toggleAll = () => {
    if (selected().size === data().length) {
      props.onChange([])
    } else {
      props.onChange(data().map((_, i) => i))
    }
  }

  return (
    <div class="space-y-2">
      <div class="rounded-lg border border-border overflow-x-auto">
        <TablePagination data={data()}>
          {(rows, info) => (
            <table class="w-full text-xs">
              <thead class="bg-surface-muted">
                <tr>
                  <th class="w-10 px-3 py-2 text-left">
                    <Show when={isMulti()} fallback={<span class="text-text-muted text-2xs">Select</span>}>
                      <Checkbox checked={selected().size === data().length && data().length > 0} onChange={toggleAll} />
                    </Show>
                  </th>
                  <For each={columns()}>
                    {(col) => <th class="px-3 py-2 text-left text-text-muted font-medium">{col.label}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <Show when={rows.length === 0}>
                  <tr>
                    <td colspan={columns().length + 1} class="px-3 py-4 text-center text-text-muted text-2xs">
                      No data available
                    </td>
                  </tr>
                </Show>
                <For each={rows}>
                  {(row, idx) => {
                    const originalIdx = () => info.start - 1 + idx()
                    return (
                      <tr
                        class={`border-t border-border cursor-pointer hover:bg-surface-muted/50 ${selected().has(originalIdx()) ? "bg-accent/10" : ""}`}
                        onClick={() => toggleRow(originalIdx())}
                      >
                        <td class="w-10 px-3 py-2">
                          <Show
                            when={isMulti()}
                            fallback={
                              <div
                                class={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected().has(originalIdx()) ? "border-accent bg-accent" : "border-border"}`}
                              >
                                <Show when={selected().has(originalIdx())}>
                                  <div class="w-1.5 h-1.5 rounded-full bg-white" />
                                </Show>
                              </div>
                            }
                          >
                            <Checkbox checked={selected().has(originalIdx())} onChange={() => {}} />
                          </Show>
                        </td>
                        <For each={columns()}>
                          {(col) => <td class="px-3 py-2 text-text">{String(row[col.key] ?? "")}</td>}
                        </For>
                      </tr>
                    )
                  }}
                </For>
                <Index each={Array(info.padRows)}>
                  {() => (
                    <tr class="border-t border-transparent">
                      <td class="w-10 px-3 py-2">&nbsp;</td>
                      <For each={columns()}>{() => <td class="px-3 py-2">&nbsp;</td>}</For>
                    </tr>
                  )}
                </Index>
              </tbody>
            </table>
          )}
        </TablePagination>
      </div>
      <div class="text-2xs text-text-muted">
        {selected().size} of {data().length} selected
      </div>
    </div>
  )
}
