import type {
  ThreadMessage,
  ThreadRun,
  ThreadHumanRequest,
  ThreadHumanResponse,
  ThreadOutputItem,
} from "../../../app/api"
import type { ToolStatus, SubagentInfo, AgentStatus } from "../../../components"

export type ToolPair = {
  call: ThreadMessage
  result: ThreadMessage | null
  status: ToolStatus
  humanRequest?: ThreadHumanRequest
}

export type SubagentHumanRequestItem = {
  request: ThreadHumanRequest
  response?: ThreadHumanResponse
}

export type SubagentWork = {
  run: ThreadRun
  tools: ToolPair[]
  outputs: ThreadOutputItem[]
  status: AgentStatus
  humanRequests: SubagentHumanRequestItem[]
  rejected?: boolean
  rejectReason?: string | null
}

export type HumanRequestItem = {
  request: ThreadHumanRequest
  response?: ThreadHumanResponse
}

export type TimelineItem =
  | { type: "user"; message: ThreadMessage }
  | {
      type: "agent"
      message?: ThreadMessage
      createdAt: string
      tools: ToolPair[]
      outputs: ThreadOutputItem[]
      pendingHumanRequest: ThreadHumanRequest | null
      status: AgentStatus
      delegatedTo: SubagentInfo | null
      subagentWorks: SubagentWork[]
      summary?: string
      humanRequests?: HumanRequestItem[]
    }
  | { type: "rejection"; reason: string | null; createdAt: string }
