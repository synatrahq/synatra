import { Show, createMemo } from "solid-js"
import { ApprovalPanel } from "./approval-panel"
import { FieldsPanel, SubmittedFieldsPanel } from "./fields-panel"
import { formatRemainingTime } from "./utils"
import type { ThreadHumanRequest, ThreadHumanResponse, ThreadAgent, ThreadRun } from "../../app/api"

export { ApprovalPanel } from "./approval-panel"
export { FieldsPanel, SubmittedFieldsPanel } from "./fields-panel"
export type { HumanRequestPanelProps } from "./types"
export type { JSONSchema } from "../../ui"

type SubagentInfo = {
  name: string
  icon: string | null
  iconColor: string | null
}

type HumanRequestRendererProps = {
  request: ThreadHumanRequest
  response?: ThreadHumanResponse | null
  agent?: ThreadAgent | null
  runs?: ThreadRun[]
  currentUserId?: string | null
  threadCreatedBy?: string | null
  isChannelOwner?: boolean
  onRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  responding?: boolean
}

export function HumanRequestRenderer(props: HumanRequestRendererProps) {
  const isApproval = () => props.request.kind === "approval"
  const isPending = () => props.request.status === "pending"
  const remainingTime = createMemo(() => formatRemainingTime(props.request.expiresAt))

  const subagentInfo = createMemo((): SubagentInfo | null => {
    if (!props.runs || !props.request.runId) return null
    const run = props.runs.find((r) => r.id === props.request.runId)
    if (!run || !run.parentRunId || !run.agent) return null
    return { name: run.agent.name, icon: run.agent.icon, iconColor: run.agent.iconColor }
  })

  const handleSubmit = (data: { responses: Record<string, unknown> }) => {
    if (props.onRespond) {
      props.onRespond(props.request.id, "respond", data)
    }
  }

  const handleSkip = (reason: string) => {
    if (props.onRespond) {
      props.onRespond(props.request.id, "skip", { reason })
    }
  }

  return (
    <Show
      when={!isApproval()}
      fallback={
        <ApprovalPanel
          request={props.request}
          agent={props.agent}
          currentUserId={props.currentUserId}
          threadCreatedBy={props.threadCreatedBy}
          isChannelOwner={props.isChannelOwner}
          onRespond={props.onRespond}
          responding={props.responding}
        />
      }
    >
      <Show
        when={isPending()}
        fallback={<SubmittedFieldsPanel request={props.request} response={props.response} subagent={subagentInfo()} />}
      >
        <FieldsPanel
          request={props.request}
          remainingTime={remainingTime()}
          onSubmit={handleSubmit}
          onSkip={handleSkip}
          responding={props.responding}
          subagent={subagentInfo()}
        />
      </Show>
    </Show>
  )
}
