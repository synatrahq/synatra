import { Show, For, createMemo, createSignal, type JSX } from "solid-js"
import { diffLines } from "diff"
import { Button } from "../../../../ui"
import { Check, X, Plus, Minus, PencilSimple, CaretDown, CaretRight } from "phosphor-solid-js"
import type { AgentRuntimeConfig, AgentTool, SubagentDefinition } from "@synatra/core/types"

type DiffInspectorProps = {
  before: AgentRuntimeConfig
  after: AgentRuntimeConfig
  onApprove: () => void
  onReject: () => void
  approving: boolean
  rejecting: boolean
}

type ToolChange = {
  type: "added" | "removed" | "modified"
  name: string
  before?: AgentTool
  after?: AgentTool
}

type TypeChange = {
  type: "added" | "removed" | "modified"
  name: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

type SubagentChange = {
  type: "added" | "removed" | "modified"
  alias: string
  before?: SubagentDefinition
  after?: SubagentDefinition
}

type DiffResult = {
  model: { changed: boolean; before?: string; after?: string }
  prompt: { changed: boolean; before?: string; after?: string }
  tools: ToolChange[]
  subagents: SubagentChange[]
  types: TypeChange[]
  limits: { changed: boolean; details: string[] }
  stats: { additions: number; deletions: number; modifications: number }
}

function computeFullDiff(before: AgentRuntimeConfig, after: AgentRuntimeConfig): DiffResult {
  const modelChanged =
    before.model.provider !== after.model.provider ||
    before.model.model !== after.model.model ||
    before.model.temperature !== after.model.temperature ||
    before.model.topP !== after.model.topP ||
    JSON.stringify(before.model.reasoning) !== JSON.stringify(after.model.reasoning)

  const promptChanged = before.systemPrompt !== after.systemPrompt

  const beforeTools = new Map((before.tools ?? []).map((t) => [t.name, t]))
  const afterTools = new Map((after.tools ?? []).map((t) => [t.name, t]))
  const tools: ToolChange[] = []
  for (const [name, tool] of afterTools) {
    if (!beforeTools.has(name)) {
      tools.push({ type: "added", name, after: tool })
    } else {
      const bt = beforeTools.get(name)!
      if (JSON.stringify(bt) !== JSON.stringify(tool)) {
        tools.push({ type: "modified", name, before: bt, after: tool })
      }
    }
  }
  for (const [name, tool] of beforeTools) {
    if (!afterTools.has(name)) {
      tools.push({ type: "removed", name, before: tool })
    }
  }

  const getSubagentKey = (s: SubagentDefinition) => s.alias ?? s.agentId
  const beforeSubagents = new Map((before.subagents ?? []).map((s) => [getSubagentKey(s), s]))
  const afterSubagents = new Map((after.subagents ?? []).map((s) => [getSubagentKey(s), s]))
  const subagents: SubagentChange[] = []
  for (const [alias, sub] of afterSubagents) {
    if (!beforeSubagents.has(alias)) {
      subagents.push({ type: "added", alias, after: sub })
    } else {
      const bs = beforeSubagents.get(alias)!
      if (JSON.stringify(bs) !== JSON.stringify(sub)) {
        subagents.push({ type: "modified", alias, before: bs, after: sub })
      }
    }
  }
  for (const [alias, sub] of beforeSubagents) {
    if (!afterSubagents.has(alias)) {
      subagents.push({ type: "removed", alias, before: sub })
    }
  }

  const beforeTypes = before.$defs ?? {}
  const afterTypes = after.$defs ?? {}
  const types: TypeChange[] = []
  for (const name of Object.keys(afterTypes)) {
    if (!(name in beforeTypes)) {
      types.push({ type: "added", name, after: afterTypes[name] as Record<string, unknown> })
    } else if (JSON.stringify(beforeTypes[name]) !== JSON.stringify(afterTypes[name])) {
      types.push({
        type: "modified",
        name,
        before: beforeTypes[name] as Record<string, unknown>,
        after: afterTypes[name] as Record<string, unknown>,
      })
    }
  }
  for (const name of Object.keys(beforeTypes)) {
    if (!(name in afterTypes)) {
      types.push({ type: "removed", name, before: beforeTypes[name] as Record<string, unknown> })
    }
  }

  const limitsDetails: string[] = []
  if (before.maxIterations !== after.maxIterations) limitsDetails.push("maxIterations")
  if (before.maxToolCallsPerIteration !== after.maxToolCallsPerIteration) limitsDetails.push("maxToolCallsPerIteration")
  if (before.maxActiveTimeMs !== after.maxActiveTimeMs) limitsDetails.push("maxActiveTimeMs")

  const additions =
    tools.filter((t) => t.type === "added").length +
    subagents.filter((s) => s.type === "added").length +
    types.filter((t) => t.type === "added").length
  const deletions =
    tools.filter((t) => t.type === "removed").length +
    subagents.filter((s) => s.type === "removed").length +
    types.filter((t) => t.type === "removed").length
  const modifications =
    (modelChanged ? 1 : 0) +
    (promptChanged ? 1 : 0) +
    (limitsDetails.length > 0 ? 1 : 0) +
    tools.filter((t) => t.type === "modified").length +
    subagents.filter((s) => s.type === "modified").length +
    types.filter((t) => t.type === "modified").length

  return {
    model: {
      changed: modelChanged,
      before: modelChanged ? `${before.model.provider}/${before.model.model}` : undefined,
      after: modelChanged ? `${after.model.provider}/${after.model.model}` : undefined,
    },
    prompt: {
      changed: promptChanged,
      before: promptChanged ? before.systemPrompt : undefined,
      after: promptChanged ? after.systemPrompt : undefined,
    },
    tools,
    subagents,
    types,
    limits: { changed: limitsDetails.length > 0, details: limitsDetails },
    stats: { additions, deletions, modifications },
  }
}

function DiffSection(props: { title: string; icon: JSX.Element; defaultExpanded?: boolean; children: JSX.Element }) {
  const [expanded, setExpanded] = createSignal(props.defaultExpanded ?? true)
  return (
    <div class="border-b border-border last:border-b-0">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-muted/50"
        onClick={() => setExpanded(!expanded())}
      >
        <Show when={expanded()} fallback={<CaretRight class="h-3 w-3 text-text-muted" />}>
          <CaretDown class="h-3 w-3 text-text-muted" />
        </Show>
        {props.icon}
        <span>{props.title}</span>
      </button>
      <Show when={expanded()}>
        <div class="px-3 pb-3">{props.children}</div>
      </Show>
    </div>
  )
}

function ChangeIcon(props: { type: "added" | "removed" | "modified" }) {
  switch (props.type) {
    case "added":
      return <Plus class="h-3 w-3 text-success" weight="bold" />
    case "removed":
      return <Minus class="h-3 w-3 text-danger" weight="bold" />
    case "modified":
      return <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
  }
}

function DiffLine(props: { type: "added" | "removed" | "unchanged"; content: string; lineNumber?: number }) {
  const bgClass = () => {
    switch (props.type) {
      case "added":
        return "bg-success/10"
      case "removed":
        return "bg-danger/10"
      default:
        return ""
    }
  }
  const textClass = () => {
    switch (props.type) {
      case "added":
        return "text-success"
      case "removed":
        return "text-danger"
      default:
        return "text-text-muted"
    }
  }
  const prefix = () => {
    switch (props.type) {
      case "added":
        return "+"
      case "removed":
        return "-"
      default:
        return " "
    }
  }
  return (
    <div class={`flex font-code text-[11px] ${bgClass()}`}>
      <Show when={props.lineNumber !== undefined}>
        <span class="w-8 shrink-0 select-none text-right pr-2 text-text-muted/50">{props.lineNumber}</span>
      </Show>
      <span class={`w-4 shrink-0 select-none text-center ${textClass()}`}>{prefix()}</span>
      <span class={`flex-1 whitespace-pre-wrap ${textClass()}`}>{props.content}</span>
    </div>
  )
}

function computeLineDiff(before: string | undefined, after: string | undefined): JSX.Element {
  const beforeText = before ?? ""
  const afterText = after ?? ""

  if (before === undefined) {
    const lines = afterText.split("\n")
    return <For each={lines}>{(line, i) => <DiffLine type="added" content={line} lineNumber={i() + 1} />}</For>
  }
  if (after === undefined) {
    const lines = beforeText.split("\n")
    return <For each={lines}>{(line, i) => <DiffLine type="removed" content={line} lineNumber={i() + 1} />}</For>
  }

  const changes = diffLines(beforeText, afterText)
  const result: JSX.Element[] = []
  let beforeLine = 1
  let afterLine = 1

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n")
    const type = change.added ? "added" : change.removed ? "removed" : "unchanged"
    for (const line of lines) {
      const lineNumber = change.added ? afterLine : beforeLine
      result.push(<DiffLine type={type} content={line} lineNumber={lineNumber} />)
      if (change.removed) {
        beforeLine++
      } else if (change.added) {
        afterLine++
      } else {
        beforeLine++
        afterLine++
      }
    }
  }
  return <>{result}</>
}

function JsonDiff(props: { before?: unknown; after?: unknown }) {
  const beforeStr = () => (props.before !== undefined ? JSON.stringify(props.before, null, 2) : undefined)
  const afterStr = () => (props.after !== undefined ? JSON.stringify(props.after, null, 2) : undefined)
  return <div class="rounded border border-border overflow-hidden">{computeLineDiff(beforeStr(), afterStr())}</div>
}

function ToolDiff(props: { change: ToolChange }) {
  const [showDetails, setShowDetails] = createSignal(props.change.type === "modified")

  return (
    <div class="rounded border border-border overflow-hidden">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-muted/50 transition-colors"
        onClick={() => setShowDetails(!showDetails())}
      >
        <Show when={showDetails()} fallback={<CaretRight class="h-3 w-3 text-text-muted" />}>
          <CaretDown class="h-3 w-3 text-text-muted" />
        </Show>
        <ChangeIcon type={props.change.type} />
        <span class="font-code text-text">{props.change.name}()</span>
        <span class="text-text-muted capitalize">{props.change.type}</span>
      </button>
      <Show when={showDetails()}>
        <div class="border-t border-border">
          <Show when={props.change.type === "added" && props.change.after}>
            <div class="p-2 space-y-2">
              <div class="text-2xs text-text-muted">Description</div>
              <DiffLine type="added" content={props.change.after!.description || "(no description)"} />
              <div class="text-2xs text-text-muted mt-2">Code</div>
              <div class="rounded border border-border overflow-hidden">
                <For each={(props.change.after!.code || "").split("\n")}>
                  {(line, i) => <DiffLine type="added" content={line} lineNumber={i() + 1} />}
                </For>
              </div>
              <Show when={props.change.after!.timeoutMs !== undefined}>
                <div class="text-2xs text-text-muted mt-2">Timeout</div>
                <DiffLine type="added" content={`${props.change.after!.timeoutMs}ms`} />
              </Show>
              <Show when={props.change.after!.requiresReview}>
                <div class="text-2xs text-text-muted mt-2">Requires Review</div>
                <DiffLine type="added" content="true" />
              </Show>
              <Show when={props.change.after!.approvalAuthority !== undefined}>
                <div class="text-2xs text-text-muted mt-2">Approval Authority</div>
                <DiffLine type="added" content={props.change.after!.approvalAuthority!} />
              </Show>
              <Show when={props.change.after!.selfApproval}>
                <div class="text-2xs text-text-muted mt-2">Self Approval</div>
                <DiffLine type="added" content="true" />
              </Show>
              <Show when={props.change.after!.approvalTimeoutMs !== undefined}>
                <div class="text-2xs text-text-muted mt-2">Approval Timeout</div>
                <DiffLine type="added" content={`${props.change.after!.approvalTimeoutMs}ms`} />
              </Show>
            </div>
          </Show>
          <Show when={props.change.type === "removed" && props.change.before}>
            <div class="p-2 space-y-2">
              <div class="text-2xs text-text-muted">Description</div>
              <DiffLine type="removed" content={props.change.before!.description || "(no description)"} />
              <div class="text-2xs text-text-muted mt-2">Code</div>
              <div class="rounded border border-border overflow-hidden">
                <For each={(props.change.before!.code || "").split("\n")}>
                  {(line, i) => <DiffLine type="removed" content={line} lineNumber={i() + 1} />}
                </For>
              </div>
              <Show when={props.change.before!.timeoutMs !== undefined}>
                <div class="text-2xs text-text-muted mt-2">Timeout</div>
                <DiffLine type="removed" content={`${props.change.before!.timeoutMs}ms`} />
              </Show>
              <Show when={props.change.before!.requiresReview}>
                <div class="text-2xs text-text-muted mt-2">Requires Review</div>
                <DiffLine type="removed" content="true" />
              </Show>
              <Show when={props.change.before!.approvalAuthority !== undefined}>
                <div class="text-2xs text-text-muted mt-2">Approval Authority</div>
                <DiffLine type="removed" content={props.change.before!.approvalAuthority!} />
              </Show>
              <Show when={props.change.before!.selfApproval}>
                <div class="text-2xs text-text-muted mt-2">Self Approval</div>
                <DiffLine type="removed" content="true" />
              </Show>
              <Show when={props.change.before!.approvalTimeoutMs !== undefined}>
                <div class="text-2xs text-text-muted mt-2">Approval Timeout</div>
                <DiffLine type="removed" content={`${props.change.before!.approvalTimeoutMs}ms`} />
              </Show>
            </div>
          </Show>
          <Show when={props.change.type === "modified" && props.change.before && props.change.after}>
            <div class="p-2 space-y-2">
              <Show when={props.change.before!.description !== props.change.after!.description}>
                <div class="text-2xs text-text-muted">Description</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={props.change.before!.description || "(no description)"} />
                  <DiffLine type="added" content={props.change.after!.description || "(no description)"} />
                </div>
              </Show>
              <Show when={props.change.before!.code !== props.change.after!.code}>
                <div class="text-2xs text-text-muted">Code</div>
                <div class="rounded border border-border overflow-hidden">
                  {computeLineDiff(props.change.before!.code, props.change.after!.code)}
                </div>
              </Show>
              <Show when={JSON.stringify(props.change.before!.params) !== JSON.stringify(props.change.after!.params)}>
                <div class="text-2xs text-text-muted">Parameters</div>
                <JsonDiff before={props.change.before!.params} after={props.change.after!.params} />
              </Show>
              <Show when={JSON.stringify(props.change.before!.returns) !== JSON.stringify(props.change.after!.returns)}>
                <div class="text-2xs text-text-muted">Returns</div>
                <JsonDiff before={props.change.before!.returns} after={props.change.after!.returns} />
              </Show>
              <Show when={props.change.before!.timeoutMs !== props.change.after!.timeoutMs}>
                <div class="text-2xs text-text-muted">Timeout</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine
                    type="removed"
                    content={
                      props.change.before!.timeoutMs !== undefined ? `${props.change.before!.timeoutMs}ms` : "(default)"
                    }
                  />
                  <DiffLine
                    type="added"
                    content={
                      props.change.after!.timeoutMs !== undefined ? `${props.change.after!.timeoutMs}ms` : "(default)"
                    }
                  />
                </div>
              </Show>
              <Show when={props.change.before!.requiresReview !== props.change.after!.requiresReview}>
                <div class="text-2xs text-text-muted">Requires Review</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={String(props.change.before!.requiresReview ?? false)} />
                  <DiffLine type="added" content={String(props.change.after!.requiresReview ?? false)} />
                </div>
              </Show>
              <Show when={props.change.before!.approvalAuthority !== props.change.after!.approvalAuthority}>
                <div class="text-2xs text-text-muted">Approval Authority</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={props.change.before!.approvalAuthority ?? "(default)"} />
                  <DiffLine type="added" content={props.change.after!.approvalAuthority ?? "(default)"} />
                </div>
              </Show>
              <Show when={props.change.before!.selfApproval !== props.change.after!.selfApproval}>
                <div class="text-2xs text-text-muted">Self Approval</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={String(props.change.before!.selfApproval ?? false)} />
                  <DiffLine type="added" content={String(props.change.after!.selfApproval ?? false)} />
                </div>
              </Show>
              <Show when={props.change.before!.approvalTimeoutMs !== props.change.after!.approvalTimeoutMs}>
                <div class="text-2xs text-text-muted">Approval Timeout</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine
                    type="removed"
                    content={
                      props.change.before!.approvalTimeoutMs !== undefined
                        ? `${props.change.before!.approvalTimeoutMs}ms`
                        : "(default)"
                    }
                  />
                  <DiffLine
                    type="added"
                    content={
                      props.change.after!.approvalTimeoutMs !== undefined
                        ? `${props.change.after!.approvalTimeoutMs}ms`
                        : "(default)"
                    }
                  />
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function SubagentDiff(props: { change: SubagentChange }) {
  const [showDetails, setShowDetails] = createSignal(props.change.type === "modified")

  return (
    <div class="rounded border border-border overflow-hidden">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-muted/50 transition-colors"
        onClick={() => setShowDetails(!showDetails())}
      >
        <Show when={showDetails()} fallback={<CaretRight class="h-3 w-3 text-text-muted" />}>
          <CaretDown class="h-3 w-3 text-text-muted" />
        </Show>
        <ChangeIcon type={props.change.type} />
        <span class="font-code text-text">delegate_to_{props.change.alias}()</span>
        <span class="text-text-muted capitalize">{props.change.type}</span>
      </button>
      <Show when={showDetails()}>
        <div class="border-t border-border">
          <Show when={props.change.type === "added" && props.change.after}>
            <div class="p-2 space-y-2">
              <div class="text-2xs text-text-muted">Description</div>
              <DiffLine type="added" content={props.change.after!.description || "(no description)"} />
              <div class="text-2xs text-text-muted mt-2">Agent ID</div>
              <DiffLine type="added" content={props.change.after!.agentId} />
              <div class="text-2xs text-text-muted mt-2">Version Mode</div>
              <DiffLine type="added" content={props.change.after!.versionMode} />
              <Show when={props.change.after!.releaseId}>
                <div class="text-2xs text-text-muted mt-2">Release ID</div>
                <DiffLine type="added" content={props.change.after!.releaseId!} />
              </Show>
            </div>
          </Show>
          <Show when={props.change.type === "removed" && props.change.before}>
            <div class="p-2 space-y-2">
              <div class="text-2xs text-text-muted">Description</div>
              <DiffLine type="removed" content={props.change.before!.description || "(no description)"} />
              <div class="text-2xs text-text-muted mt-2">Agent ID</div>
              <DiffLine type="removed" content={props.change.before!.agentId} />
              <div class="text-2xs text-text-muted mt-2">Version Mode</div>
              <DiffLine type="removed" content={props.change.before!.versionMode} />
              <Show when={props.change.before!.releaseId}>
                <div class="text-2xs text-text-muted mt-2">Release ID</div>
                <DiffLine type="removed" content={props.change.before!.releaseId!} />
              </Show>
            </div>
          </Show>
          <Show when={props.change.type === "modified" && props.change.before && props.change.after}>
            <div class="p-2 space-y-2">
              <Show when={props.change.before!.description !== props.change.after!.description}>
                <div class="text-2xs text-text-muted">Description</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={props.change.before!.description || "(no description)"} />
                  <DiffLine type="added" content={props.change.after!.description || "(no description)"} />
                </div>
              </Show>
              <Show when={props.change.before!.agentId !== props.change.after!.agentId}>
                <div class="text-2xs text-text-muted">Agent ID</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={props.change.before!.agentId} />
                  <DiffLine type="added" content={props.change.after!.agentId} />
                </div>
              </Show>
              <Show when={props.change.before!.versionMode !== props.change.after!.versionMode}>
                <div class="text-2xs text-text-muted">Version Mode</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={props.change.before!.versionMode} />
                  <DiffLine type="added" content={props.change.after!.versionMode} />
                </div>
              </Show>
              <Show when={props.change.before!.releaseId !== props.change.after!.releaseId}>
                <div class="text-2xs text-text-muted">Release ID</div>
                <div class="rounded border border-border overflow-hidden">
                  <DiffLine type="removed" content={props.change.before!.releaseId ?? "(none)"} />
                  <DiffLine type="added" content={props.change.after!.releaseId ?? "(none)"} />
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function DiffInspector(props: DiffInspectorProps) {
  const diff = createMemo(() => computeFullDiff(props.before, props.after))

  const totalChanges = () => diff().stats.additions + diff().stats.deletions + diff().stats.modifications

  return (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-border px-3 py-2 bg-surface-elevated">
        <div class="flex items-center gap-3">
          <span class="text-xs font-medium text-text">Proposed Changes</span>
          <div class="flex items-center gap-2 text-2xs">
            <Show when={diff().stats.additions > 0}>
              <span class="text-success">+{diff().stats.additions}</span>
            </Show>
            <Show when={diff().stats.deletions > 0}>
              <span class="text-danger">-{diff().stats.deletions}</span>
            </Show>
            <Show when={diff().stats.modifications > 0}>
              <span class="text-warning">~{diff().stats.modifications}</span>
            </Show>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="xs" onClick={props.onReject} disabled={props.rejecting || props.approving}>
            <X class="h-3 w-3" weight="bold" />
            {props.rejecting ? "Rejecting..." : "Reject"}
          </Button>
          <Button variant="default" size="xs" onClick={props.onApprove} disabled={props.approving || props.rejecting}>
            <Check class="h-3 w-3" weight="bold" />
            {props.approving ? "Applying..." : "Apply"}
          </Button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={totalChanges() === 0}>
          <div class="flex h-full items-center justify-center text-xs text-text-muted">No changes detected</div>
        </Show>

        <Show when={totalChanges() > 0}>
          <Show when={diff().model.changed}>
            <DiffSection title="Model" icon={<PencilSimple class="h-3 w-3 text-warning" weight="bold" />}>
              <div class="rounded border border-border overflow-hidden">
                <DiffLine type="removed" content={diff().model.before!} />
                <DiffLine type="added" content={diff().model.after!} />
              </div>
            </DiffSection>
          </Show>

          <Show when={diff().prompt.changed}>
            <DiffSection title="System Prompt" icon={<PencilSimple class="h-3 w-3 text-warning" weight="bold" />}>
              <div class="rounded border border-border overflow-hidden max-h-64 overflow-y-auto">
                {computeLineDiff(diff().prompt.before, diff().prompt.after)}
              </div>
            </DiffSection>
          </Show>

          <Show when={diff().tools.length > 0}>
            <DiffSection
              title={`Tools (${diff().tools.length} change${diff().tools.length > 1 ? "s" : ""})`}
              icon={
                <div class="flex items-center gap-0.5">
                  <Show when={diff().tools.some((t) => t.type === "added")}>
                    <Plus class="h-3 w-3 text-success" weight="bold" />
                  </Show>
                  <Show when={diff().tools.some((t) => t.type === "removed")}>
                    <Minus class="h-3 w-3 text-danger" weight="bold" />
                  </Show>
                  <Show when={diff().tools.some((t) => t.type === "modified")}>
                    <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
                  </Show>
                </div>
              }
            >
              <div class="space-y-2">
                <For each={diff().tools}>{(change) => <ToolDiff change={change} />}</For>
              </div>
            </DiffSection>
          </Show>

          <Show when={diff().subagents.length > 0}>
            <DiffSection
              title={`Subagents (${diff().subagents.length} change${diff().subagents.length > 1 ? "s" : ""})`}
              icon={
                <div class="flex items-center gap-0.5">
                  <Show when={diff().subagents.some((s) => s.type === "added")}>
                    <Plus class="h-3 w-3 text-success" weight="bold" />
                  </Show>
                  <Show when={diff().subagents.some((s) => s.type === "removed")}>
                    <Minus class="h-3 w-3 text-danger" weight="bold" />
                  </Show>
                  <Show when={diff().subagents.some((s) => s.type === "modified")}>
                    <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
                  </Show>
                </div>
              }
            >
              <div class="space-y-2">
                <For each={diff().subagents}>{(change) => <SubagentDiff change={change} />}</For>
              </div>
            </DiffSection>
          </Show>

          <Show when={diff().types.length > 0}>
            <DiffSection
              title={`Types (${diff().types.length} change${diff().types.length > 1 ? "s" : ""})`}
              icon={
                <div class="flex items-center gap-0.5">
                  <Show when={diff().types.some((t) => t.type === "added")}>
                    <Plus class="h-3 w-3 text-success" weight="bold" />
                  </Show>
                  <Show when={diff().types.some((t) => t.type === "removed")}>
                    <Minus class="h-3 w-3 text-danger" weight="bold" />
                  </Show>
                  <Show when={diff().types.some((t) => t.type === "modified")}>
                    <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
                  </Show>
                </div>
              }
            >
              <div class="space-y-2">
                <For each={diff().types}>
                  {(change) => (
                    <div class="rounded border border-border overflow-hidden">
                      <div class="flex items-center gap-2 px-2 py-1.5 text-xs bg-surface-muted/30">
                        <ChangeIcon type={change.type} />
                        <span class="font-code text-text">{change.name}</span>
                        <span class="text-text-muted capitalize">{change.type}</span>
                      </div>
                      <div class="border-t border-border">
                        <JsonDiff before={change.before} after={change.after} />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </DiffSection>
          </Show>

          <Show when={diff().limits.changed}>
            <DiffSection title="Execution Limits" icon={<PencilSimple class="h-3 w-3 text-warning" weight="bold" />}>
              <div class="text-xs text-text-muted">
                Changed: <span class="font-code text-text">{diff().limits.details.join(", ")}</span>
              </div>
            </DiffSection>
          </Show>
        </Show>
      </div>
    </div>
  )
}
