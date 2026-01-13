import { createSignal, createEffect, Show, For, onMount } from "solid-js"
import { Command } from "phosphor-solid-js"
import { api, type AgentPrompt } from "../../app/api"

type PromptSelectorProps = {
  agentId: string | null
  query: string
  onQueryChange: (query: string) => void
  onSelect: (prompt: AgentPrompt) => void
  onCancel: () => void
}

export function PromptSelector(props: PromptSelectorProps) {
  const [prompts, setPrompts] = createSignal<AgentPrompt[]>([])
  const [loading, setLoading] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)

  let inputRef: HTMLInputElement | undefined

  const filtered = () => {
    const q = props.query.toLowerCase()
    return prompts().filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    )
  }

  const fetchPrompts = async () => {
    if (!props.agentId) return
    setLoading(true)
    try {
      const res = await api.api.agents[":id"].prompts.$get({ param: { id: props.agentId } })
      if (res.ok) {
        const data = await res.json()
        setPrompts(data)
      }
    } catch (e) {
      console.error("Failed to fetch prompts", e)
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    fetchPrompts()
    inputRef?.focus()
  })

  createEffect(() => {
    props.query
    setHighlightedIndex(0)
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = filtered()
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const selected = items[highlightedIndex()]
      if (selected) props.onSelect(selected)
    } else if (e.key === "Escape") {
      e.preventDefault()
      props.onCancel()
    } else if (e.key === "Backspace" && props.query === "") {
      e.preventDefault()
      props.onCancel()
    }
  }

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2 rounded border border-border bg-surface px-3 py-2">
        <Command class="h-4 w-4 text-text-muted" />
        <span class="text-xs text-text-muted">/</span>
        <input
          ref={inputRef}
          type="text"
          value={props.query}
          onInput={(e) => props.onQueryChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search prompts..."
          class="flex-1 bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none"
        />
      </div>
      <div class="max-h-48 overflow-y-auto rounded border border-border bg-surface-floating shadow-lg">
        <Show when={loading()}>
          <div class="px-3 py-2 text-xs text-text-muted">Loading...</div>
        </Show>
        <Show when={!loading() && filtered().length === 0}>
          <div class="px-3 py-2 text-xs text-text-muted">No prompts found</div>
        </Show>
        <For each={filtered()}>
          {(prompt, index) => (
            <button
              type="button"
              class="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition-colors"
              classList={{
                "bg-surface-muted": highlightedIndex() === index(),
                "hover:bg-surface-muted": highlightedIndex() !== index(),
              }}
              onClick={() => props.onSelect(prompt)}
              onMouseEnter={() => setHighlightedIndex(index())}
            >
              <span class="font-medium text-text">{prompt.name}</span>
              <Show when={prompt.description}>
                <span class="text-text-muted line-clamp-1">{prompt.description}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
