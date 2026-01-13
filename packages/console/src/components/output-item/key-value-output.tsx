import { Show, For } from "solid-js"
import type { OutputItem } from "../../app/api"

type KeyValuePayload = {
  pairs: Record<string, unknown>
}

type KeyValueOutputProps = {
  item: OutputItem
  compact?: boolean
}

export function KeyValueOutput(props: KeyValueOutputProps) {
  const payload = () => props.item.payload as KeyValuePayload
  const pairs = () => payload()?.pairs ?? {}
  const entries = () => Object.entries(pairs())

  return (
    <div class={props.compact ? "space-y-1" : "space-y-2"}>
      <Show when={props.item.name && !props.compact}>
        <h4 class="text-sm font-medium text-text">{props.item.name}</h4>
      </Show>

      <div
        class={
          props.compact
            ? "rounded border border-border bg-surface overflow-x-auto"
            : "rounded-lg border border-border bg-surface overflow-x-auto"
        }
      >
        <table class={props.compact ? "w-full text-2xs" : "w-full text-xs"}>
          <tbody>
            <For each={entries()}>
              {([key, value], index) => (
                <tr class={index() > 0 ? "border-t border-border" : ""}>
                  <td
                    class={
                      props.compact
                        ? "px-2 py-1 text-text-muted font-medium bg-surface-muted w-1/3"
                        : "px-3 py-2 text-text-muted font-medium bg-surface-muted w-1/3"
                    }
                  >
                    {key}
                  </td>
                  <td class={props.compact ? "px-2 py-1 text-text" : "px-3 py-2 text-text"}>{String(value)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  )
}
