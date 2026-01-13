import { Show, For, createMemo } from "solid-js"
import { Button } from "../../../ui"
import { Plus, Minus, PencilSimple, Check, X } from "phosphor-solid-js"
import type { AgentRuntimeConfig, AgentTool } from "@synatra/core/types"

type ConfigDiffProps = {
  before: AgentRuntimeConfig
  after: AgentRuntimeConfig
  onApprove: () => void
  onReject: () => void
  approving?: boolean
  rejecting?: boolean
}

type ToolChange = {
  type: "added" | "removed" | "modified"
  name: string
  tool?: AgentTool
}

type DiffSummary = {
  modelChanged: boolean
  modelBefore?: string
  modelAfter?: string
  promptChanged: boolean
  promptSummary?: string
  toolChanges: ToolChange[]
  defsChanged: boolean
  limitsChanged: boolean
  limitsDetails?: string[]
  totalChanges: number
}

function computeDiff(before: AgentRuntimeConfig, after: AgentRuntimeConfig): DiffSummary {
  const modelChanged =
    before.model.provider !== after.model.provider ||
    before.model.model !== after.model.model ||
    before.model.temperature !== after.model.temperature ||
    before.model.topP !== after.model.topP ||
    JSON.stringify(before.model.reasoning) !== JSON.stringify(after.model.reasoning)

  const promptChanged = before.systemPrompt !== after.systemPrompt

  const defsChanged = JSON.stringify(before.$defs) !== JSON.stringify(after.$defs)

  const limitsDetails: string[] = []
  if (before.maxIterations !== after.maxIterations) limitsDetails.push("maxIterations")
  if (before.maxToolCallsPerIteration !== after.maxToolCallsPerIteration) limitsDetails.push("maxToolCallsPerIteration")
  if (before.maxActiveTimeMs !== after.maxActiveTimeMs) limitsDetails.push("maxActiveTimeMs")
  const limitsChanged = limitsDetails.length > 0

  const beforeTools = new Map((before.tools ?? []).map((t) => [t.name, t]))
  const afterTools = new Map((after.tools ?? []).map((t) => [t.name, t]))

  const toolChanges: ToolChange[] = []

  for (const [name, tool] of afterTools) {
    if (!beforeTools.has(name)) {
      toolChanges.push({ type: "added", name, tool })
    } else {
      const beforeTool = beforeTools.get(name)!
      if (
        beforeTool.description !== tool.description ||
        beforeTool.code !== tool.code ||
        JSON.stringify(beforeTool.params) !== JSON.stringify(tool.params) ||
        JSON.stringify(beforeTool.returns) !== JSON.stringify(tool.returns) ||
        beforeTool.timeoutMs !== tool.timeoutMs ||
        beforeTool.requiresReview !== tool.requiresReview ||
        beforeTool.approvalAuthority !== tool.approvalAuthority ||
        beforeTool.selfApproval !== tool.selfApproval ||
        beforeTool.approvalTimeoutMs !== tool.approvalTimeoutMs
      ) {
        toolChanges.push({ type: "modified", name, tool })
      }
    }
  }

  for (const [name] of beforeTools) {
    if (!afterTools.has(name)) {
      toolChanges.push({ type: "removed", name })
    }
  }

  const totalChanges =
    (modelChanged ? 1 : 0) +
    (promptChanged ? 1 : 0) +
    (defsChanged ? 1 : 0) +
    (limitsChanged ? 1 : 0) +
    toolChanges.length

  return {
    modelChanged,
    modelBefore: modelChanged ? `${before.model.provider}/${before.model.model}` : undefined,
    modelAfter: modelChanged ? `${after.model.provider}/${after.model.model}` : undefined,
    promptChanged,
    promptSummary: promptChanged
      ? `${before.systemPrompt?.slice(0, 50) ?? "(empty)"}... → ${after.systemPrompt?.slice(0, 50) ?? "(empty)"}...`
      : undefined,
    toolChanges,
    defsChanged,
    limitsChanged,
    limitsDetails: limitsChanged ? limitsDetails : undefined,
    totalChanges,
  }
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

export function ConfigDiff(props: ConfigDiffProps) {
  const diff = createMemo(() => computeDiff(props.before, props.after))

  return (
    <div class="p-2">
      <div class="rounded border border-accent/30 bg-accent/5 p-2">
        <div class="flex items-center justify-between mb-2">
          <span class="text-2xs font-medium text-accent">
            {diff().totalChanges} change{diff().totalChanges !== 1 ? "s" : ""} suggested
          </span>
          <div class="flex items-center gap-1">
            <Button variant="outline" size="xs" onClick={props.onReject} disabled={props.rejecting || props.approving}>
              <X class="h-3 w-3" weight="bold" />
              {props.rejecting ? "Rejecting..." : "Reject"}
            </Button>
            <Button variant="default" size="xs" onClick={props.onApprove} disabled={props.approving || props.rejecting}>
              <Check class="h-3 w-3" weight="bold" />
              {props.approving ? "Approving..." : "Approve"}
            </Button>
          </div>
        </div>

        <Show when={diff().totalChanges === 0}>
          <p class="text-2xs text-text-muted">No changes detected</p>
        </Show>

        <Show when={diff().totalChanges > 0}>
          <div class="space-y-1">
            <Show when={diff().modelChanged}>
              <div class="flex items-center gap-1.5 text-2xs">
                <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
                <span class="text-text-muted">Model:</span>
                <span class="text-text font-code">{diff().modelBefore}</span>
                <span class="text-text-muted">→</span>
                <span class="text-text font-code">{diff().modelAfter}</span>
              </div>
            </Show>

            <Show when={diff().promptChanged}>
              <div class="flex items-center gap-1.5 text-2xs">
                <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
                <span class="text-text-muted">System prompt modified</span>
              </div>
            </Show>

            <Show when={diff().defsChanged}>
              <div class="flex items-center gap-1.5 text-2xs">
                <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
                <span class="text-text-muted">Type definitions modified</span>
              </div>
            </Show>

            <Show when={diff().limitsChanged}>
              <div class="flex items-center gap-1.5 text-2xs">
                <PencilSimple class="h-3 w-3 text-warning" weight="bold" />
                <span class="text-text-muted">Execution limits:</span>
                <span class="text-text font-code">{diff().limitsDetails?.join(", ")}</span>
              </div>
            </Show>

            <For each={diff().toolChanges}>
              {(change) => (
                <div class="flex items-center gap-1.5 text-2xs">
                  <ChangeIcon type={change.type} />
                  <span class="text-text-muted capitalize">{change.type}:</span>
                  <span class="text-text font-code">{change.name}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
