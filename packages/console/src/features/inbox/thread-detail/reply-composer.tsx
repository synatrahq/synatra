import { Button, Spinner, Textarea } from "../../../ui"
import { Command } from "phosphor-solid-js"
import { AgentIcon } from "./message"

type ReplyComposerProps = {
  agentName: string
  agentIcon: string | null
  agentIconColor: string | null
  value: string
  onInput: (value: string) => void
  onSend: () => void
  sending?: boolean
  disabled?: boolean
}

export function ReplyComposer(props: ReplyComposerProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey && props.value.trim() && !props.sending) {
      e.preventDefault()
      props.onSend()
    }
  }

  return (
    <div class="shrink-0 border-t border-border px-4 py-3">
      <div class="rounded-lg border border-border bg-surface overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span class="text-xs font-medium text-text-muted">To:</span>
          <div class="flex items-center gap-1.5">
            <AgentIcon icon={props.agentIcon} iconColor={props.agentIconColor} size={20} />
            <span class="text-xs font-medium text-text">{props.agentName}</span>
          </div>
        </div>

        <div class="px-3 py-2.5">
          <Textarea
            value={props.value}
            onInput={(e) => props.onInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your message..."
            disabled={props.disabled}
            variant="surface"
            class="shadow-none focus-visible:shadow-none !p-0"
            rows={3}
          />
        </div>

        <div class="flex items-center justify-between px-3 py-2 border-t border-border">
          <div />
          <Button
            variant="default"
            size="sm"
            onClick={props.onSend}
            disabled={props.sending || !props.value.trim() || props.disabled}
          >
            {props.sending ? (
              <>
                <Spinner size="xs" class="border-white border-t-transparent" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>Send</span>
                <div class="flex items-center gap-0.5 rounded bg-white/15 px-1 py-0.5 ml-1">
                  <Command class="h-3 w-3" />
                  <span class="text-[10px]">↵</span>
                </div>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
