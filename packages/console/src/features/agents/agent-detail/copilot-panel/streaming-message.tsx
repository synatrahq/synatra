import { Show, For } from "solid-js"
import { Spinner, Markdown } from "../../../../ui"
import { Robot, Brain, Wrench, CaretRight, Check, CircleNotch } from "phosphor-solid-js"
import type { StreamStatus, ToolCallStreaming } from "./types"

type StreamingMessageProps = {
  streamStatus: () => StreamStatus
  reasoningText: () => string
  streamingText: () => string
  toolCalls: () => ToolCallStreaming[]
  reasoningExpanded: () => boolean
  toolsExpanded: () => boolean
  onReasoningToggle: () => void
  onToolsToggle: () => void
}

export function StreamingMessage(props: StreamingMessageProps) {
  return (
    <Show when={props.streamStatus() !== "idle"}>
      <div class="flex gap-2">
        <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-muted">
          <Robot class="h-3 w-3" weight="duotone" />
        </div>
        <div class="flex-1 min-w-0 space-y-1.5">
          <Show when={props.reasoningText()}>
            <ReasoningSection
              text={props.reasoningText()}
              isActive={props.streamStatus() === "reasoning"}
              expanded={props.reasoningExpanded()}
              onToggle={props.onReasoningToggle}
            />
          </Show>
          <Show when={props.toolCalls().length > 0}>
            <ToolsSection
              toolCalls={props.toolCalls()}
              expanded={props.toolsExpanded()}
              onToggle={props.onToolsToggle}
            />
          </Show>
          <Show when={props.streamingText()}>
            <Markdown class="text-xs text-text [&_pre]:text-[10px] [&_code]:text-[10px]">
              {props.streamingText()}
            </Markdown>
          </Show>
          <Show
            when={
              props.streamStatus() !== "streaming" &&
              !props.streamingText() &&
              !props.reasoningText() &&
              props.toolCalls().length === 0
            }
          >
            <div class="flex items-center gap-1.5 text-2xs text-text-muted">
              <Spinner size="xs" />
              <span>Thinking...</span>
            </div>
          </Show>
          <Show when={props.streamStatus() === "streaming"}>
            <div class="flex items-center gap-1.5 text-xs text-text-muted">
              <span class="inline-block w-1.5 h-3 bg-text-muted/50 animate-pulse" />
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}

type ReasoningSectionProps = {
  text: string
  isActive: boolean
  expanded: boolean
  onToggle: () => void
}

function ReasoningSection(props: ReasoningSectionProps) {
  return (
    <>
      <button
        type="button"
        class="flex items-center gap-1.5 text-2xs text-text-muted hover:text-text transition-colors"
        onClick={props.onToggle}
      >
        <CaretRight class="h-2.5 w-2.5 transition-transform" classList={{ "rotate-90": props.expanded }} />
        <Brain class="h-3 w-3" weight="duotone" />
        <span>Thinking</span>
        <Show when={props.isActive}>
          <span class="inline-block w-1 h-1 rounded-full bg-accent animate-pulse" />
        </Show>
      </button>
      <Show when={props.expanded}>
        <div class="ml-5 rounded border border-border/50 bg-surface-muted/30 p-2">
          <p class="text-2xs text-text-muted/80 whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin">
            {props.text}
          </p>
        </div>
      </Show>
    </>
  )
}

type ToolsSectionProps = {
  toolCalls: ToolCallStreaming[]
  expanded: boolean
  onToggle: () => void
}

function ToolsSection(props: ToolsSectionProps) {
  const completed = () => props.toolCalls.filter((tc) => tc.status === "completed").length
  const total = () => props.toolCalls.length
  const allDone = () => completed() === total()

  return (
    <>
      <button
        type="button"
        class="flex items-center gap-1.5 text-2xs text-text-muted hover:text-text transition-colors"
        onClick={props.onToggle}
      >
        <CaretRight class="h-2.5 w-2.5 transition-transform" classList={{ "rotate-90": props.expanded }} />
        <Show when={allDone()} fallback={<Spinner size="xs" class="h-3 w-3" />}>
          <Wrench class="h-3 w-3 text-success" />
        </Show>
        <span>
          Tools {completed()}/{total()}
        </span>
      </button>
      <Show when={props.expanded}>
        <div class="ml-5 mt-1 flex flex-col gap-0.5">
          <For each={props.toolCalls}>
            {(tc) => (
              <span class="inline-flex items-center gap-1.5 py-0.5 text-2xs font-code text-text-muted">
                <Show
                  when={tc.status === "completed"}
                  fallback={<CircleNotch class="h-3 w-3 text-text-muted animate-spin" />}
                >
                  <Check class="h-3 w-3 text-success" weight="bold" />
                </Show>
                {tc.toolName}
              </span>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}
