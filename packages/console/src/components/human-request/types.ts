import type { ThreadHumanRequest, ThreadAgent } from "../../app/api"

export type HumanRequestPanelProps = {
  request: ThreadHumanRequest
  agent?: ThreadAgent | null
  currentUserId?: string | null
  threadCreatedBy?: string | null
  isChannelOwner?: boolean
  onRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  responding?: boolean
}
