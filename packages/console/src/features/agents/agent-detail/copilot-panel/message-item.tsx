import { Show, For, createSignal } from "solid-js"
import { Markdown } from "../../../../ui"
import { User, Robot, Wrench, Warning, CaretRight, Check } from "phosphor-solid-js"
import type { CopilotMessage, CopilotToolLog } from "./types"

type MessageItemProps = {
  message: CopilotMessage
  toolLogs: CopilotToolLog[]
}

export function MessageItem(props: MessageItemProps) {
  const getLog = (toolCallId: string) => props.toolLogs.find((l) => l.toolCallId === toolCallId)

  return (
    <div class="flex gap-2">
      <div
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        classList={{
          "bg-accent-soft text-accent": props.message.role === "user",
          "bg-surface-muted text-text-muted": props.message.role === "assistant",
        }}
      >
        <Show when={props.message.role === "user"} fallback={<Robot class="h-3 w-3" weight="duotone" />}>
          <User class="h-3 w-3" weight="duotone" />
        </Show>
      </div>
      <div class="flex-1 min-w-0">
        <Show
          when={props.message.role === "assistant"}
          fallback={<p class="text-xs text-text whitespace-pre-wrap">{props.message.content}</p>}
        >
          <Show when={props.message.toolCalls && props.message.toolCalls.length > 0}>
            <ToolCallList toolCalls={props.message.toolCalls!} getLog={getLog} />
          </Show>
          <Markdown class="text-xs text-text [&_pre]:text-[10px] [&_code]:text-[10px]">
            {props.message.content}
          </Markdown>
        </Show>
      </div>
    </div>
  )
}

type ToolCallListProps = {
  toolCalls: NonNullable<CopilotMessage["toolCalls"]>
  getLog: (toolCallId: string) => CopilotToolLog | undefined
}

function ToolCallList(props: ToolCallListProps) {
  const [expanded, setExpanded] = createSignal(false)
  const hasError = () => props.toolCalls.some((tc) => props.getLog(tc.id)?.status === "failed")
  const total = () => props.toolCalls.length

  return (
    <>
      <button
        type="button"
        class="mb-1.5 flex items-center gap-1.5 text-2xs text-text-muted hover:text-text transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span class="h-2.5 w-2.5 transition-transform" classList={{ "rotate-90": expanded() }}>
          <CaretRight class="h-2.5 w-2.5" />
        </span>
        <Show when={hasError()} fallback={<Wrench class="h-3 w-3 text-success" />}>
          <Warning class="h-3 w-3 text-danger" weight="fill" />
        </Show>
        <span>Tools {total()}</span>
      </button>
      <Show when={expanded()}>
        <div class="ml-5 mb-1.5 flex flex-col gap-0.5">
          <For each={props.toolCalls}>
            {(tc) => {
              const log = () => props.getLog(tc.id)
              return (
                <div class="flex flex-col gap-0.5 py-0.5">
                  <span class="inline-flex items-center gap-1.5 text-2xs font-code text-text-muted">
                    <Show
                      when={log()?.status === "failed"}
                      fallback={<Check class="h-3 w-3 text-success" weight="bold" />}
                    >
                      <Warning class="h-3 w-3 text-danger" weight="fill" />
                    </Show>
                    {tc.name}
                    <Show when={log()?.latencyMs}>
                      <span class="text-text-muted/60">{log()!.latencyMs}ms</span>
                    </Show>
                  </span>
                  <Show when={log()?.error}>
                    <span class="ml-4 text-2xs text-danger">{log()!.error}</span>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </>
  )
}
