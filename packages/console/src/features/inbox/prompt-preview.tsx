import { Show, createSignal, createMemo } from "solid-js"
import { CaretDown, CaretRight, Warning, Code } from "phosphor-solid-js"
import { tryRenderTemplate } from "../../utils/render-template"

type PromptPreviewProps = {
  mode: "template" | "script"
  template: string
  script: string | null
  values: Record<string, unknown>
  collapsed?: boolean
}

export function PromptPreview(props: PromptPreviewProps) {
  const [expanded, setExpanded] = createSignal(!props.collapsed)

  const rendered = createMemo(() => {
    if (props.mode === "script") return { ok: true as const, result: props.script ?? "" }
    return tryRenderTemplate(props.template, props.values)
  })

  const result = () => {
    const r = rendered()
    return r.ok ? r.result : null
  }

  const error = () => {
    const r = rendered()
    return r.ok ? null : r.error
  }

  return (
    <div class="rounded border border-border bg-surface">
      <button
        type="button"
        class="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-2xs hover:bg-surface-muted/50"
        onClick={() => setExpanded(!expanded())}
      >
        {expanded() ? <CaretDown class="h-3 w-3 text-text-muted" /> : <CaretRight class="h-3 w-3 text-text-muted" />}
        <span class="font-medium text-text-muted">Preview</span>
        <Show when={props.mode === "script"}>
          <Code class="h-3 w-3 text-text-muted" />
          <span class="text-2xs text-text-muted">(script)</span>
        </Show>
        <Show when={error()}>
          <Warning class="h-3 w-3 text-warning" />
        </Show>
      </button>
      <Show when={expanded()}>
        <div class="border-t border-border px-2 py-1.5">
          <Show when={result()} fallback={<div class="text-2xs text-warning">{error()}</div>}>
            {(text) => (
              <pre class="max-h-32 overflow-auto whitespace-pre-wrap text-2xs text-text font-mono">{text()}</pre>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}
