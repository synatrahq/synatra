import { Show } from "solid-js"
import { Button, Spinner, Textarea, PopoverSelect } from "../../../../ui"
import { ArrowUp } from "phosphor-solid-js"
import type { CopilotModel } from "./types"

type InputFormProps = {
  value: string
  loading: boolean
  models: CopilotModel[]
  selectedModel: string | null
  onInput: (value: string) => void
  onSend: () => void
  onModelChange: (modelId: string | null) => void
}

export function InputForm(props: InputFormProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey && props.value.trim() && !props.loading) {
      e.preventDefault()
      props.onSend()
    }
  }

  return (
    <div class="shrink-0 border-t border-border p-2">
      <div class="rounded border border-border bg-surface overflow-hidden">
        <Textarea
          value={props.value}
          onInput={(e) => props.onInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to configure..."
          disabled={props.loading}
          variant="surface"
          rows={2}
          class="border-none shadow-none focus-visible:shadow-none resize-none text-xs"
        />
        <div class="h-7 flex items-center gap-2 px-2">
          <PopoverSelect
            value={props.selectedModel ?? undefined}
            options={props.models.map((m) => ({ value: m.id, label: m.name }))}
            onChange={props.onModelChange}
            disabled={props.loading || props.models.length === 0}
          />
          <span class="flex-1" />
          <span class="text-2xs text-text-muted">⌘↵</span>
          <Button variant="default" size="xs" onClick={props.onSend} disabled={props.loading || !props.value.trim()}>
            <Show when={props.loading} fallback={<ArrowUp class="h-3 w-3" weight="bold" />}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
          </Button>
        </div>
      </div>
    </div>
  )
}
