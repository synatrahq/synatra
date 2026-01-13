import { Show, type JSX, createSignal } from "solid-js"

type CollapsibleSectionProps = {
  title: string
  defaultExpanded?: boolean
  children: JSX.Element
  actions?: JSX.Element
}

export function CollapsibleSection(props: CollapsibleSectionProps) {
  const [expanded, setExpanded] = createSignal(props.defaultExpanded ?? true)

  return (
    <div class="border-b border-border last:border-b-0">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-muted/50"
        onClick={() => setExpanded(!expanded())}
      >
        <span>{props.title}</span>
        <Show when={props.actions}>
          <div class="shrink-0" onClick={(e) => e.stopPropagation()}>
            {props.actions}
          </div>
        </Show>
      </button>
      <Show when={expanded()}>
        <div class="px-3 pb-3">{props.children}</div>
      </Show>
    </div>
  )
}
