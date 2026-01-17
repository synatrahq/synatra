import { Show, For, createMemo, createSignal } from "solid-js"
import { Plus, Minus, PencilSimple, CaretDown, CaretRight } from "phosphor-solid-js"
import type { CopilotTriggerConfig } from "../copilot-panel/types"

type TriggerDiffViewProps = {
  before: CopilotTriggerConfig
  after: CopilotTriggerConfig
}

type FieldChange = {
  key: string
  label: string
  type: "added" | "removed" | "modified"
  before?: string
  after?: string
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  type: "Type",
  mode: "Mode",
  cron: "Schedule (Cron)",
  timezone: "Timezone",
  template: "Template",
  script: "Script",
  appAccountId: "App Account",
  appEvents: "App Events",
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)"
  if (Array.isArray(value)) return value.join(", ") || "(empty)"
  return String(value)
}

function computeConfigDiff(before: CopilotTriggerConfig, after: CopilotTriggerConfig): FieldChange[] {
  const changes: FieldChange[] = []
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const beforeVal = before[key as keyof CopilotTriggerConfig]
    const afterVal = after[key as keyof CopilotTriggerConfig]
    const beforeStr = JSON.stringify(beforeVal)
    const afterStr = JSON.stringify(afterVal)

    if (beforeStr === afterStr) continue

    const label = FIELD_LABELS[key] ?? key

    if (beforeVal === undefined || beforeVal === null) {
      changes.push({
        key,
        label,
        type: "added",
        after: formatValue(afterVal),
      })
    } else if (afterVal === undefined || afterVal === null) {
      changes.push({
        key,
        label,
        type: "removed",
        before: formatValue(beforeVal),
      })
    } else {
      changes.push({
        key,
        label,
        type: "modified",
        before: formatValue(beforeVal),
        after: formatValue(afterVal),
      })
    }
  }

  return changes
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

function DiffLine(props: { type: "added" | "removed"; content: string }) {
  const bgClass = props.type === "added" ? "bg-success/10" : "bg-danger/10"
  const textClass = props.type === "added" ? "text-success" : "text-danger"
  const prefix = props.type === "added" ? "+" : "-"

  return (
    <div class={`flex font-code text-[11px] px-2 py-1 ${bgClass}`}>
      <span class={`w-4 shrink-0 select-none text-center ${textClass}`}>{prefix}</span>
      <span class={`flex-1 whitespace-pre-wrap ${textClass}`}>{props.content}</span>
    </div>
  )
}

function FieldDiff(props: { change: FieldChange }) {
  return (
    <div class="rounded border border-border overflow-hidden">
      <div class="flex items-center gap-2 px-2 py-1.5 text-xs bg-surface-muted/30">
        <ChangeIcon type={props.change.type} />
        <span class="font-medium text-text">{props.change.label}</span>
        <span class="text-text-muted capitalize">{props.change.type}</span>
      </div>
      <div class="border-t border-border">
        <Show when={props.change.type === "added"}>
          <DiffLine type="added" content={props.change.after!} />
        </Show>
        <Show when={props.change.type === "removed"}>
          <DiffLine type="removed" content={props.change.before!} />
        </Show>
        <Show when={props.change.type === "modified"}>
          <DiffLine type="removed" content={props.change.before!} />
          <DiffLine type="added" content={props.change.after!} />
        </Show>
      </div>
    </div>
  )
}

function ConfigSection(props: { title: string; config: CopilotTriggerConfig }) {
  const [expanded, setExpanded] = createSignal(false)

  const displayFields = () => {
    const fields: { label: string; value: string }[] = []
    const c = props.config

    if (c.name) fields.push({ label: "Name", value: c.name })
    if (c.type) fields.push({ label: "Type", value: c.type })
    if (c.mode) fields.push({ label: "Mode", value: c.mode })
    if (c.cron) fields.push({ label: "Schedule", value: c.cron })
    if (c.timezone) fields.push({ label: "Timezone", value: c.timezone })
    if (c.template)
      fields.push({ label: "Template", value: c.template.slice(0, 100) + (c.template.length > 100 ? "..." : "") })
    if (c.script) fields.push({ label: "Script", value: c.script.slice(0, 100) + (c.script.length > 100 ? "..." : "") })
    if (c.appAccountId) fields.push({ label: "App Account", value: c.appAccountId })
    if (c.appEvents?.length) fields.push({ label: "App Events", value: c.appEvents.join(", ") })

    return fields
  }

  return (
    <div class="rounded border border-border overflow-hidden">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-muted/50"
        onClick={() => setExpanded(!expanded())}
      >
        <Show when={expanded()} fallback={<CaretRight class="h-3 w-3 text-text-muted" />}>
          <CaretDown class="h-3 w-3 text-text-muted" />
        </Show>
        <span>{props.title}</span>
      </button>
      <Show when={expanded()}>
        <div class="border-t border-border p-3 space-y-2">
          <For each={displayFields()}>
            {(field) => (
              <div class="flex gap-2 text-xs">
                <span class="w-24 shrink-0 text-text-muted">{field.label}</span>
                <span class="text-text font-code break-all">{field.value}</span>
              </div>
            )}
          </For>
          <Show when={displayFields().length === 0}>
            <span class="text-xs text-text-muted">(no configuration)</span>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function TriggerDiffView(props: TriggerDiffViewProps) {
  const changes = createMemo(() => computeConfigDiff(props.before, props.after))

  const stats = createMemo(() => {
    const c = changes()
    return {
      additions: c.filter((x) => x.type === "added").length,
      deletions: c.filter((x) => x.type === "removed").length,
      modifications: c.filter((x) => x.type === "modified").length,
    }
  })

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <span class="text-xs font-medium text-text">Configuration Changes</span>
        <div class="flex items-center gap-2 text-2xs">
          <Show when={stats().additions > 0}>
            <span class="text-success">+{stats().additions}</span>
          </Show>
          <Show when={stats().deletions > 0}>
            <span class="text-danger">-{stats().deletions}</span>
          </Show>
          <Show when={stats().modifications > 0}>
            <span class="text-warning">~{stats().modifications}</span>
          </Show>
        </div>
      </div>

      <Show when={changes().length === 0}>
        <div class="text-xs text-text-muted py-4 text-center">No configuration changes</div>
      </Show>

      <Show when={changes().length > 0}>
        <div class="space-y-2">
          <For each={changes()}>{(change) => <FieldDiff change={change} />}</For>
        </div>
      </Show>

      <div class="pt-2 space-y-2">
        <ConfigSection title="Current Configuration" config={props.before} />
        <ConfigSection title="Proposed Configuration" config={props.after} />
      </div>
    </div>
  )
}
