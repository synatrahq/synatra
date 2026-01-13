import { Show } from "solid-js"
import { Select } from "../../../../ui"
import { Sparkle, Plus, Trash } from "phosphor-solid-js"
import type { CopilotThread } from "./types"

type HeaderProps = {
  threads: CopilotThread[]
  selectedThreadId: string | null
  historyLoading: boolean
  onThreadSelect: (threadId: string) => void
  onCreateThread: () => void
  onDeleteThread: () => void
}

export function Header(props: HeaderProps) {
  const threadOptions = () =>
    props.threads.map((t) => ({
      value: t.id,
      label: t.title,
    }))

  return (
    <>
      <div class="flex h-8 items-center justify-between border-b border-border px-3">
        <div class="flex items-center gap-1.5">
          <Sparkle class="h-3.5 w-3.5 text-accent" weight="duotone" />
          <span class="text-xs font-medium text-text">Copilot</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
            onClick={props.onCreateThread}
            title="New conversation"
          >
            <Plus class="h-3.5 w-3.5" />
          </button>
          <Show when={props.selectedThreadId}>
            <button
              type="button"
              class="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
              onClick={props.onDeleteThread}
              title="Delete conversation"
            >
              <Trash class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>
      </div>

      <Show when={!props.historyLoading && props.threads.length > 0}>
        <div class="border-b border-border px-2 py-1.5">
          <Select
            value={props.selectedThreadId ?? ""}
            onChange={props.onThreadSelect}
            options={threadOptions()}
            placeholder="Select conversation"
          />
        </div>
      </Show>
    </>
  )
}
