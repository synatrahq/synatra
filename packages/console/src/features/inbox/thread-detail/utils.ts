import { isSystemTool, isOutputTool, isDelegationTool, isComputeTool } from "@synatra/core/system-tools"
import type {
  ThreadMessage,
  ThreadHumanRequest,
  ThreadHumanResponse,
  ThreadOutputItem,
  ThreadRun,
} from "../../../app/api"
import type { ToolPair, TimelineItem, SubagentWork } from "./types"
import type { ToolStatus, AgentStatus, SubagentInfo } from "../../../components"
import { getToolStatus } from "../../../components"

export function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email) {
    const local = email.split("@")[0]
    return local.slice(0, 2).toUpperCase()
  }
  return "U"
}

function getAgentStatus(run: ThreadRun, tools: ToolPair[]): AgentStatus {
  const hasRunningTool = tools.some((t) => t.status === "running")
  const runningTool = tools.find((t) => t.status === "running")
  if (run.status === "running" || hasRunningTool) {
    return hasRunningTool && runningTool?.call.toolCall?.name
      ? { type: "running_tool", toolName: runningTool.call.toolCall.name }
      : { type: "thinking" }
  }
  return null
}

function getRejectReason(run: ThreadRun, tools: ToolPair[]): string | null {
  if (run.status !== "rejected") return null
  const rejectTool = tools.find((t) => t.status === "rejected")
  return rejectTool
    ? ((rejectTool.result?.toolResult?.result as Record<string, unknown> | null)?.reason as string | null)
    : (run.error as string | null)
}

function collectHumanRequestsForRun(
  runId: string,
  humanRequests: ThreadHumanRequest[],
  humanResponseByRequestId: Map<string, ThreadHumanResponse>,
): Array<{ request: ThreadHumanRequest; response?: ThreadHumanResponse }> {
  const result: Array<{ request: ThreadHumanRequest; response?: ThreadHumanResponse }> = []
  for (const hr of humanRequests) {
    if (hr.runId === runId && hr.kind !== "approval") {
      result.push({ request: hr, response: humanResponseByRequestId.get(hr.id) })
    }
  }
  result.sort((a, b) => new Date(a.request.createdAt).getTime() - new Date(b.request.createdAt).getTime())
  return result
}

function collectToolsForRun(
  runId: string,
  messages: ThreadMessage[],
  resultMap: Map<string, ThreadMessage>,
  humanRequestByToolCallId: Map<string, ThreadHumanRequest>,
): ToolPair[] {
  const tools: ToolPair[] = []
  for (const msg of messages) {
    if (msg.runId !== runId) continue
    if (
      msg.type === "tool_call" &&
      msg.toolCall &&
      (!isSystemTool(msg.toolCall.name) || isComputeTool(msg.toolCall.name))
    ) {
      const r = resultMap.get(msg.toolCall.id) ?? null
      const hr = humanRequestByToolCallId.get(msg.toolCall.id)
      tools.push({ call: msg, result: r, status: getToolStatus(r), humanRequest: hr })
    }
  }
  return tools
}

function collectOutputsForRun(
  runId: string,
  messages: ThreadMessage[],
  outputItems: ThreadOutputItem[],
): ThreadOutputItem[] {
  const outputs: ThreadOutputItem[] = []
  for (const output of outputItems) {
    const toolCallMsg = messages.find((m) => m.toolCall?.id === output.toolCallId)
    if (toolCallMsg?.runId === runId) outputs.push(output)
  }
  return outputs
}

type TimelineEntry = {
  createdAt: string
  item: TimelineItem
}

type BuildTimelineOptions = {
  messages: ThreadMessage[]
  humanRequests?: ThreadHumanRequest[]
  outputItems?: ThreadOutputItem[]
  humanResponses?: ThreadHumanResponse[]
  runs?: ThreadRun[]
  threadStatus?: string
}

export function buildTimeline(opts: BuildTimelineOptions): TimelineItem[] {
  const { messages, humanRequests = [], outputItems = [], humanResponses = [], runs = [], threadStatus } = opts
  const entries: TimelineEntry[] = []
  const resultMap = new Map<string, ThreadMessage>()
  const outputByToolCallId = new Map<string, ThreadOutputItem[]>()
  const humanRequestByToolCallId = new Map<string, ThreadHumanRequest>()
  const humanResponseByRequestId = new Map<string, ThreadHumanResponse>()

  const parentRun = runs.find((r) => !r.parentRunId)
  const subagentRuns = runs.filter((r) => r.parentRunId)
  const runById = new Map(runs.map((r) => [r.id, r]))
  const subagentsByParentRunId = new Map<string, ThreadRun[]>()
  for (const run of subagentRuns) {
    if (!run.parentRunId) continue
    const list = subagentsByParentRunId.get(run.parentRunId) ?? []
    list.push(run)
    subagentsByParentRunId.set(run.parentRunId, list)
  }

  for (const msg of messages) {
    if (msg.type === "tool_result" && msg.toolResult) {
      resultMap.set(msg.toolResult.toolCallId, msg)
    }
  }

  for (const output of outputItems) {
    if (output.toolCallId) {
      const list = outputByToolCallId.get(output.toolCallId) ?? []
      list.push(output)
      outputByToolCallId.set(output.toolCallId, list)
    }
  }

  for (const hr of humanRequests) {
    if (hr.toolCallId) {
      humanRequestByToolCallId.set(hr.toolCallId, hr)
    }
  }

  for (const resp of humanResponses) {
    humanResponseByRequestId.set(resp.requestId, resp)
  }

  const pendingApproval = humanRequests.find((r) => r.status === "pending" && r.kind === "approval")
  const activeSubagentRun = subagentRuns.find((r) => r.status === "running" || r.status === "waiting_human")

  const getMatchingThreadHumanRequest = (tools: ToolPair[]): ThreadHumanRequest | null => {
    if (!pendingApproval) return null
    const match = tools.some((t) => t.call.toolCall?.id === pendingApproval.toolCallId)
    return match ? pendingApproval : null
  }

  const getSubagentInfo = (runId: string | null | undefined): SubagentInfo | null => {
    if (!runId) return null
    const run = runById.get(runId)
    if (!run?.parentRunId || !run.agent) return null
    return { name: run.agent.name, icon: run.agent.icon, iconColor: run.agent.iconColor }
  }

  const isSubagentMessage = (msg: ThreadMessage): boolean => {
    if (!msg.runId) return false
    const run = runById.get(msg.runId)
    return !!run?.parentRunId
  }

  let pendingParentTools: ToolPair[] = []
  let pendingParentOutputs: ThreadOutputItem[] = []
  let pendingSubagentTools: Map<string, ToolPair[]> = new Map()
  let pendingSubagentOutputs: Map<string, ThreadOutputItem[]> = new Map()
  let lastDelegatedSubagent: SubagentInfo | null = null
  const consumedSubagentRuns = new Set<string>()

  const findSubagentWorkForDelegation = (delegationTool: ToolPair, parentRunId: string): SubagentWork | null => {
    const subagents = subagentsByParentRunId.get(parentRunId) ?? []
    const delegationTime = new Date(delegationTool.call.createdAt).getTime()
    const resultTime = delegationTool.result ? new Date(delegationTool.result.createdAt).getTime() : Infinity

    for (const subRun of subagents) {
      if (consumedSubagentRuns.has(subRun.id)) continue
      const startTime = subRun.startedAt ? new Date(subRun.startedAt).getTime() : 0
      if (startTime >= delegationTime && startTime <= resultTime) {
        const tools = collectToolsForRun(subRun.id, messages, resultMap, humanRequestByToolCallId)
        const outputs = collectOutputsForRun(subRun.id, messages, outputItems)
        const subagentHumanRequests = collectHumanRequestsForRun(subRun.id, humanRequests, humanResponseByRequestId)
        const rejected = subRun.status === "rejected"
        consumedSubagentRuns.add(subRun.id)
        return {
          run: subRun,
          tools,
          outputs,
          status: getAgentStatus(subRun, tools),
          humanRequests: subagentHumanRequests,
          rejected,
          rejectReason: getRejectReason(subRun, tools),
        }
      }
    }
    return null
  }

  const flushParent = (ts: string, humanToolCallId?: string, parentRunId?: string | null) => {
    const humanRequest = humanToolCallId ? humanRequestByToolCallId.get(humanToolCallId) : undefined
    if (pendingParentTools.length === 0 && pendingParentOutputs.length === 0 && !humanRequest) return

    const delegationTools = pendingParentTools.filter((t) => isDelegationTool(t.call.toolCall?.name ?? ""))
    const visibleTools = pendingParentTools.filter((t) => !isDelegationTool(t.call.toolCall?.name ?? ""))

    const allSubagentWorks: SubagentWork[] = []
    for (const delegation of delegationTools) {
      const subagentWork = parentRunId ? findSubagentWorkForDelegation(delegation, parentRunId) : null
      if (subagentWork) allSubagentWorks.push(subagentWork)
    }

    const hasRunningTool = visibleTools.some((t) => t.status === "running")
    const runningTool = visibleTools.find((t) => t.status === "running")
    let status: AgentStatus = null
    if (hasRunningTool && runningTool?.call.toolCall?.name) {
      status = { type: "running_tool", toolName: runningTool.call.toolCall.name }
    }

    const firstDelegatedTo: SubagentInfo | null = allSubagentWorks[0]?.run.agent
      ? {
          name: allSubagentWorks[0].run.agent.name,
          icon: allSubagentWorks[0].run.agent.icon,
          iconColor: allSubagentWorks[0].run.agent.iconColor,
        }
      : null

    const hrItems =
      humanRequest && humanRequest.kind !== "approval"
        ? [{ request: humanRequest, response: humanResponseByRequestId.get(humanRequest.id) }]
        : undefined

    entries.push({
      createdAt:
        visibleTools[0]?.call.createdAt ??
        delegationTools[0]?.call.createdAt ??
        pendingParentOutputs[0]?.createdAt ??
        ts,
      item: {
        type: "agent",
        message: visibleTools[0]?.call ?? delegationTools[0]?.call,
        createdAt:
          visibleTools[0]?.call.createdAt ??
          delegationTools[0]?.call.createdAt ??
          pendingParentOutputs[0]?.createdAt ??
          ts,
        tools: visibleTools,
        outputs: pendingParentOutputs,
        pendingHumanRequest: getMatchingThreadHumanRequest(visibleTools),
        status,
        delegatedTo: firstDelegatedTo,
        subagentWorks: allSubagentWorks,
        humanRequests: hrItems,
      },
    })

    pendingParentTools = []
    pendingParentOutputs = []
  }

  const buildSubagentWork = (runId: string): SubagentWork | null => {
    const tools = pendingSubagentTools.get(runId) ?? []
    const outputs = pendingSubagentOutputs.get(runId) ?? []
    const run = runById.get(runId)
    if (!run) return null

    const subagentHumanRequests = collectHumanRequestsForRun(runId, humanRequests, humanResponseByRequestId)
    const rejected = run.status === "rejected"

    if (
      tools.length === 0 &&
      outputs.length === 0 &&
      subagentHumanRequests.length === 0 &&
      run.status !== "running" &&
      !rejected
    ) {
      return null
    }

    pendingSubagentTools.delete(runId)
    pendingSubagentOutputs.delete(runId)

    return {
      run,
      tools,
      outputs,
      status: getAgentStatus(run, tools),
      humanRequests: subagentHumanRequests,
      rejected,
      rejectReason: getRejectReason(run, tools),
    }
  }

  const buildSubagentWorksForParent = (parentRunId: string, beforeTs?: string): SubagentWork[] => {
    const result: SubagentWork[] = []
    const subagents = subagentsByParentRunId.get(parentRunId) ?? []
    for (const subRun of subagents) {
      if (consumedSubagentRuns.has(subRun.id)) continue
      if (beforeTs && subRun.startedAt && new Date(subRun.startedAt).getTime() > new Date(beforeTs).getTime()) continue

      const tools = collectToolsForRun(subRun.id, messages, resultMap, humanRequestByToolCallId)
      const outputs = collectOutputsForRun(subRun.id, messages, outputItems)
      const subagentHumanRequests = collectHumanRequestsForRun(subRun.id, humanRequests, humanResponseByRequestId)
      const rejected = subRun.status === "rejected"
      const hasContent = tools.length > 0 || outputs.length > 0 || subagentHumanRequests.length > 0

      if (hasContent || subRun.status === "running" || rejected) {
        consumedSubagentRuns.add(subRun.id)
        result.push({
          run: subRun,
          tools,
          outputs,
          status: getAgentStatus(subRun, tools),
          humanRequests: subagentHumanRequests,
          rejected,
          rejectReason: getRejectReason(subRun, tools),
        })
      }
    }
    return result
  }

  for (const msg of messages) {
    if (msg.type === "tool_result") continue

    const msgIsSubagent = isSubagentMessage(msg)
    const subagentRunId = msgIsSubagent ? msg.runId! : null

    if (msg.type === "user") {
      flushParent(msg.createdAt)
      pendingSubagentTools.clear()
      pendingSubagentOutputs.clear()
      entries.push({ createdAt: msg.createdAt, item: { type: "user", message: msg } })
      continue
    }

    if (msg.type === "assistant") {
      if (msgIsSubagent && subagentRunId) {
        continue
      } else {
        const visibleTools = pendingParentTools.filter((t) => !isDelegationTool(t.call.toolCall?.name ?? ""))
        const hasRunningTool = visibleTools.some((t) => t.status === "running")
        const runningTool = visibleTools.find((t) => t.status === "running")
        let status: AgentStatus = null
        if (hasRunningTool && runningTool?.call.toolCall?.name) {
          status = { type: "running_tool", toolName: runningTool.call.toolCall.name }
        }

        const subagentWorks: SubagentWork[] = []
        for (const runId of pendingSubagentTools.keys()) {
          const work = buildSubagentWork(runId)
          if (work) subagentWorks.push(work)
        }

        entries.push({
          createdAt: msg.createdAt,
          item: {
            type: "agent",
            message: msg,
            createdAt: msg.createdAt,
            tools: visibleTools,
            outputs: pendingParentOutputs,
            pendingHumanRequest: getMatchingThreadHumanRequest(pendingParentTools),
            status,
            delegatedTo: subagentWorks[0]
              ? {
                  name: subagentWorks[0].run.agent?.name ?? "Subagent",
                  icon: subagentWorks[0].run.agent?.icon ?? null,
                  iconColor: subagentWorks[0].run.agent?.iconColor ?? null,
                }
              : null,
            subagentWorks,
          },
        })
        pendingParentTools = []
        pendingParentOutputs = []
      }
      continue
    }

    if (msg.type === "tool_call" && msg.toolCall) {
      if (isSystemTool(msg.toolCall.name) && !isComputeTool(msg.toolCall.name)) {
        if (isOutputTool(msg.toolCall.name)) {
          const outputs = outputByToolCallId.get(msg.toolCall.id) ?? []
          if (msgIsSubagent && subagentRunId) {
            const list = pendingSubagentOutputs.get(subagentRunId) ?? []
            list.push(...outputs)
            pendingSubagentOutputs.set(subagentRunId, list)
          } else {
            pendingParentOutputs.push(...outputs)
          }
          continue
        }

        if (isDelegationTool(msg.toolCall.name) && !msgIsSubagent) {
          const result = resultMap.get(msg.toolCall.id) ?? null
          const status = getToolStatus(result)
          pendingParentTools.push({ call: msg, result, status })
          continue
        }

        const isHumanTool = msg.toolCall.name.startsWith("human_")
        if (!msgIsSubagent) {
          flushParent(msg.createdAt, isHumanTool ? msg.toolCall.id : undefined, msg.runId)
        }
        const result = resultMap.get(msg.toolCall.id)
        if (msg.toolCall.name === "task_complete") {
          const r = result?.toolResult?.result as { summary?: string } | undefined
          if (r?.summary) {
            const lastEntry = entries[entries.length - 1]
            if (lastEntry?.item.type === "agent") {
              lastEntry.item.summary = r.summary
            } else {
              entries.push({
                createdAt: result?.createdAt ?? msg.createdAt,
                item: {
                  type: "agent",
                  message: undefined,
                  createdAt: result?.createdAt ?? msg.createdAt,
                  tools: [],
                  outputs: [],
                  pendingHumanRequest: null,
                  status: null,
                  delegatedTo: null,
                  subagentWorks: [],
                  summary: r.summary,
                },
              })
            }
          }
        }
        continue
      }

      const result = resultMap.get(msg.toolCall.id) ?? null
      const humanRequest = humanRequestByToolCallId.get(msg.toolCall.id)
      const status = getToolStatus(result)
      const pair: ToolPair = { call: msg, result, status, humanRequest }

      if (msgIsSubagent && subagentRunId) {
        const list = pendingSubagentTools.get(subagentRunId) ?? []
        list.push(pair)
        pendingSubagentTools.set(subagentRunId, list)
      } else {
        pendingParentTools.push(pair)
        const subagentInfo = getSubagentInfo(msg.runId)
        if (subagentInfo) {
          lastDelegatedSubagent = subagentInfo
        }
      }

      if ((result?.toolResult?.result as Record<string, unknown> | null)?.approved === false) {
        const response = humanRequest ? humanResponseByRequestId.get(humanRequest.id) : undefined
        if (!msgIsSubagent) {
          flushParent(msg.createdAt, undefined, msg.runId)
          entries.push({
            createdAt: response?.createdAt ?? msg.createdAt,
            item: {
              type: "rejection",
              reason: (response?.data as { comment?: string })?.comment ?? null,
              createdAt: response?.createdAt ?? msg.createdAt,
            },
          })
        }
      }
    }
  }

  const finalSubagentWorks: SubagentWork[] = []
  for (const runId of pendingSubagentTools.keys()) {
    if (consumedSubagentRuns.has(runId)) continue
    const work = buildSubagentWork(runId)
    if (work) finalSubagentWorks.push(work)
  }

  if (finalSubagentWorks.length === 0 && activeSubagentRun && !consumedSubagentRuns.has(activeSubagentRun.id)) {
    const tools = pendingSubagentTools.get(activeSubagentRun.id) ?? []
    const outputs = pendingSubagentOutputs.get(activeSubagentRun.id) ?? []
    const hasRunningTool = tools.some((t) => t.status === "running")
    const runningTool = tools.find((t) => t.status === "running")
    const subagentHumanRequests: Array<{ request: ThreadHumanRequest; response?: ThreadHumanResponse }> = []
    for (const hr of humanRequests) {
      if (hr.runId === activeSubagentRun.id && hr.kind !== "approval") {
        subagentHumanRequests.push({ request: hr, response: humanResponseByRequestId.get(hr.id) })
      }
    }
    subagentHumanRequests.sort(
      (a, b) => new Date(a.request.createdAt).getTime() - new Date(b.request.createdAt).getTime(),
    )
    finalSubagentWorks.push({
      run: activeSubagentRun,
      tools,
      outputs,
      status:
        hasRunningTool && runningTool?.call.toolCall?.name
          ? { type: "running_tool", toolName: runningTool.call.toolCall.name }
          : { type: "thinking" },
      humanRequests: subagentHumanRequests,
    })
  }

  if (pendingParentTools.length > 0 || pendingParentOutputs.length > 0) {
    const lastTool = pendingParentTools[pendingParentTools.length - 1]
    const lastOutput = pendingParentOutputs[pendingParentOutputs.length - 1]
    const createdAt = lastTool?.call.createdAt ?? lastOutput?.createdAt ?? new Date().toISOString()
    const parentRunId = lastTool?.call.runId ?? lastOutput?.runId ?? null
    flushParent(createdAt, undefined, parentRunId)
  }

  entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  const items = entries.map((e) => e.item)

  const hasPendingHumanRequest = humanRequests.some((r) => r.status === "pending")
  const isRunning = (threadStatus === "running" || threadStatus === "waiting_human") && !hasPendingHumanRequest

  if (items.length > 0) {
    const last = items[items.length - 1]

    const needsThinkingEntry = last.type === "user"
    if (isRunning && needsThinkingEntry) {
      const hasActiveSubagent = activeSubagentRun?.status === "running" || activeSubagentRun?.status === "waiting_human"
      items.push({
        type: "agent",
        message: undefined,
        createdAt: new Date().toISOString(),
        tools: [],
        outputs: [],
        pendingHumanRequest: null,
        status: hasActiveSubagent
          ? { type: "waiting_subagent", subagentName: activeSubagentRun!.agent?.name ?? "Subagent" }
          : { type: "thinking" },
        delegatedTo: finalSubagentWorks[0]?.run.agent
          ? {
              name: finalSubagentWorks[0].run.agent.name,
              icon: finalSubagentWorks[0].run.agent.icon,
              iconColor: finalSubagentWorks[0].run.agent.iconColor,
            }
          : null,
        subagentWorks: finalSubagentWorks,
      })
    } else if (last.type === "agent") {
      if (finalSubagentWorks.length > 0 && last.subagentWorks.length === 0) {
        last.delegatedTo = {
          name: finalSubagentWorks[0].run.agent?.name ?? "Subagent",
          icon: finalSubagentWorks[0].run.agent?.icon ?? null,
          iconColor: finalSubagentWorks[0].run.agent?.iconColor ?? null,
        }
        last.subagentWorks = finalSubagentWorks
      }
      if (isRunning && !last.status) {
        const hasActiveSubagent =
          activeSubagentRun?.status === "running" || activeSubagentRun?.status === "waiting_human"
        if (hasActiveSubagent) {
          last.status = { type: "waiting_subagent", subagentName: activeSubagentRun!.agent?.name ?? "Subagent" }
        } else {
          const hasRunningTool = last.tools.some((t) => t.status === "running")
          if (!hasRunningTool) {
            last.status = last.outputs.length > 0 ? { type: "processing" } : { type: "thinking" }
          }
        }
      }
    }
  }

  if (isRunning && items.length === 0) {
    const hasActiveSubagent = activeSubagentRun?.status === "running" || activeSubagentRun?.status === "waiting_human"
    items.push({
      type: "agent",
      message: undefined,
      createdAt: new Date().toISOString(),
      tools: [],
      outputs: [],
      pendingHumanRequest: null,
      status: hasActiveSubagent
        ? { type: "waiting_subagent", subagentName: activeSubagentRun!.agent?.name ?? "Subagent" }
        : { type: "thinking" },
      delegatedTo: finalSubagentWorks[0]?.run.agent
        ? {
            name: finalSubagentWorks[0].run.agent.name,
            icon: finalSubagentWorks[0].run.agent.icon,
            iconColor: finalSubagentWorks[0].run.agent.iconColor,
          }
        : null,
      subagentWorks: finalSubagentWorks,
    })
  }

  return items
}
