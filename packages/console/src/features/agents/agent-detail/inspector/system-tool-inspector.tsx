import { Show, For, createSignal } from "solid-js"
import {
  Code,
  CaretRight,
  CaretDown,
  Table,
  ChartLine,
  TextAa,
  ListDashes,
  Queue,
  CheckCircle,
  ArrowUUpLeft,
  Terminal,
} from "phosphor-solid-js"
import type { SystemToolDefinition } from "@synatra/core/system-tools"
import { Markdown, CollapsibleSection } from "../../../../ui"
import { TOOL_SAMPLES, TOOL_PARAMS, type ParameterDef } from "./constants"

function ParameterItem(props: { param: ParameterDef; parentPath?: string }) {
  const [expanded, setExpanded] = createSignal(false)
  const hasChildren = () => props.param.children && props.param.children.length > 0
  const fullPath = () => (props.parentPath ? `${props.parentPath}.${props.param.name}` : props.param.name)

  return (
    <div class="border-t border-border first:border-t-0">
      <div class="flex flex-col gap-1.5 px-3 py-2.5">
        <div class="flex items-center gap-2 flex-wrap">
          <code class="font-code text-[11px]">
            <Show when={props.parentPath}>
              <span class="text-text-muted">{props.parentPath}.</span>
            </Show>
            <span class="text-text">{props.param.name}</span>
          </code>
          <span class="text-[10px] text-text-muted">{props.param.type}</span>
          <Show when={props.param.required}>
            <span class="text-[10px] text-warning">required</span>
          </Show>
        </div>
        <p class="text-[11px] text-text-muted leading-relaxed">{props.param.description}</p>
        <Show when={hasChildren()}>
          <div class="flex items-center gap-2 mt-1">
            <button
              type="button"
              class="flex items-center gap-1.5 text-[10px] text-accent hover:text-accent-hover transition-colors"
              onClick={() => setExpanded(!expanded())}
            >
              <Show when={expanded()} fallback={<CaretRight class="h-2.5 w-2.5" />}>
                <CaretDown class="h-2.5 w-2.5" />
              </Show>
              <span>{expanded() ? "Hide" : "Show"} child attributes</span>
            </button>
            <Show when={expanded()}>
              <span class="flex-1 h-px bg-border" />
            </Show>
          </div>
        </Show>
      </div>
      <Show when={hasChildren() && expanded()}>
        <div class="border-l-2 border-border ml-3">
          <For each={props.param.children}>{(child) => <ParameterItem param={child} parentPath={fullPath()} />}</For>
        </div>
      </Show>
    </div>
  )
}

function ParameterList(props: { params: ParameterDef[] }) {
  return (
    <div class="rounded-md border border-border bg-surface overflow-hidden">
      <For each={props.params}>{(param) => <ParameterItem param={param} />}</For>
    </div>
  )
}

function OutputTableInspector() {
  const [showParams, setShowParams] = createSignal(false)
  const sample = TOOL_SAMPLES.output_table as {
    columns: { key: string; label: string }[]
    data: Record<string, string>[]
    name: string
  }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display data as a formatted table. Ideal for showing structured data like lists, records, or query results.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_table} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface overflow-hidden">
            <div class="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
              <Table class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">{sample.name}</span>
            </div>
            <table class="w-full text-[10px]">
              <thead>
                <tr class="bg-surface-muted">
                  <For each={sample.columns}>
                    {(col) => <th class="px-2.5 py-1.5 text-left font-medium text-text-muted">{col.label}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={sample.data}>
                  {(row) => (
                    <tr class="border-t border-border/50">
                      <For each={sample.columns}>
                        {(col) => <td class="px-2.5 py-1.5 text-text">{row[col.key]}</td>}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_table, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function OutputChartInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display line, bar, or pie charts. Uses Chart.js compatible data format for flexible visualization.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_chart} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <ChartLine class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">Monthly Sales</span>
            </div>
            <div class="flex items-center justify-center py-6 text-text-muted bg-surface-muted rounded">
              <ChartLine class="h-8 w-8 opacity-40" weight="duotone" />
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_chart, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function OutputMarkdownInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display markdown formatted content. Supports GitHub Flavored Markdown for rich text output.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_markdown} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <TextAa class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">Report</span>
            </div>
            <div class="[&_h2]:text-xs! [&_p]:text-[10px]! [&_li]:text-[10px]!">
              <Markdown class="text-text">{(TOOL_SAMPLES.output_markdown as { content: string }).content}</Markdown>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_markdown, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function OutputKeyValueInspector() {
  const [showParams, setShowParams] = createSignal(false)
  const sample = TOOL_SAMPLES.output_key_value as { pairs: Record<string, string>; name: string }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Display key-value pairs in a compact table format. Ideal for status information, metadata, or configuration.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.output_key_value} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface overflow-hidden">
            <div class="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
              <ListDashes class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">{sample.name}</span>
            </div>
            <table class="w-full text-[10px]">
              <tbody>
                <For each={Object.entries(sample.pairs)}>
                  {([key, value]) => (
                    <tr class="border-t border-border/50 first:border-t-0">
                      <td class="px-2.5 py-1.5 font-medium text-text-muted w-1/3">{key}</td>
                      <td class="px-2.5 py-1.5 text-text">{value}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.output_key_value, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function HumanRequestInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Request user input. Supports multiple field types: form (JSON Schema), question (multiple choice), select_rows
          (table selection), and confirm (yes/no). Pauses workflow until user responds.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.human_request} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <Queue class="h-3.5 w-3.5 text-success" weight="duotone" />
              <span class="text-[10px] font-medium text-text">Complete Setup</span>
              <span class="ml-auto text-[9px] text-success bg-success/10 px-1 py-0.5 rounded">input</span>
            </div>
            <p class="text-[10px] text-text-muted mb-2">Please provide the required information.</p>
            <div class="space-y-2">
              <div class="rounded border border-border/50 p-2">
                <span class="text-[9px] text-text-muted">profile (form)</span>
                <div class="h-5 mt-1 rounded bg-surface-muted" />
              </div>
              <div class="rounded border border-border/50 p-2">
                <span class="text-[9px] text-text-muted">framework (question)</span>
                <p class="text-[10px] text-text mt-1">Which framework should we use?</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.human_request, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function TaskCompleteInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Mark the current task as completed. Use this when the user's request has been fully resolved. The summary is
          displayed to the user in a completion card.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.task_complete} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-success/30 bg-success/5 p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <CheckCircle class="h-3.5 w-3.5 text-success" weight="duotone" />
              <span class="text-[10px] font-medium text-success">Completed</span>
            </div>
            <div class="[&_h2]:text-xs! [&_p]:text-[10px]! [&_li]:text-[10px]! [&_strong]:text-[10px]!">
              <Markdown class="text-text">{(TOOL_SAMPLES.task_complete as { summary: string }).summary}</Markdown>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.task_complete, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function ReturnToParentInspector() {
  const [showParams, setShowParams] = createSignal(false)

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Return a result to the parent run and complete this subagent run. Only available when depth {">"} 0 (i.e.,
          running as a subagent).
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.return_to_parent} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-accent/30 bg-accent/5 p-2.5">
            <div class="flex items-center gap-1.5 mb-2">
              <ArrowUUpLeft class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-accent">Returning to parent</span>
            </div>
            <p class="text-[10px] text-text-muted">{(TOOL_SAMPLES.return_to_parent as { summary: string }).summary}</p>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.return_to_parent, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function CodeExecuteInspector() {
  const [showParams, setShowParams] = createSignal(false)
  const sample = TOOL_SAMPLES.code_execute as { code: string; timeout: number }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Overview">
        <p class="text-xs text-text-muted leading-relaxed">
          Execute JavaScript code for reliable calculations and data transformations. Runs in an isolated sandbox with
          no database or API access. Use this instead of mental math for accurate results.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Parameters">
        <ParameterList params={TOOL_PARAMS.code_execute} />
      </CollapsibleSection>

      <CollapsibleSection title="Preview">
        <div class="space-y-2">
          <div class="rounded-lg border border-border bg-surface overflow-hidden">
            <div class="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
              <Terminal class="h-3.5 w-3.5 text-accent" weight="duotone" />
              <span class="text-[10px] font-medium text-text">Code Execution</span>
              <span class="ml-auto text-[9px] text-text-muted">{sample.timeout}ms timeout</span>
            </div>
            <div class="p-2.5 bg-surface-muted">
              <pre class="font-code text-[10px] text-text whitespace-pre-wrap">{sample.code}</pre>
            </div>
            <div class="flex items-center gap-1.5 px-2.5 py-2 border-t border-border bg-success/5">
              <CheckCircle class="h-3 w-3 text-success" weight="fill" />
              <span class="text-[10px] text-success">Result:</span>
              <code class="text-[10px] text-text">{`{ sum: 5050, average: 50.5 }`}</code>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 text-[9px] text-text-muted hover:text-text transition-colors"
            onClick={() => setShowParams(!showParams())}
          >
            <Show when={showParams()} fallback={<CaretRight class="h-2 w-2" />}>
              <CaretDown class="h-2 w-2" />
            </Show>
            <Code class="h-2.5 w-2.5" />
            <span>Parameters</span>
          </button>
          <Show when={showParams()}>
            <div class="rounded border border-border/50 bg-surface-muted p-1.5 font-code text-[9px] text-text-muted overflow-x-auto max-h-32">
              <pre class="whitespace-pre-wrap">{JSON.stringify(TOOL_SAMPLES.code_execute, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </div>
  )
}

export function SystemToolInspector(props: { tool: SystemToolDefinition }) {
  const name = () => props.tool.name

  return (
    <>
      <Show when={name() === "output_table"}>
        <OutputTableInspector />
      </Show>
      <Show when={name() === "output_chart"}>
        <OutputChartInspector />
      </Show>
      <Show when={name() === "output_markdown"}>
        <OutputMarkdownInspector />
      </Show>
      <Show when={name() === "output_key_value"}>
        <OutputKeyValueInspector />
      </Show>
      <Show when={name() === "human_request"}>
        <HumanRequestInspector />
      </Show>
      <Show when={name() === "task_complete"}>
        <TaskCompleteInspector />
      </Show>
      <Show when={name() === "return_to_parent"}>
        <ReturnToParentInspector />
      </Show>
      <Show when={name() === "code_execute"}>
        <CodeExecuteInspector />
      </Show>
      <Show
        when={
          ![
            "output_table",
            "output_chart",
            "output_markdown",
            "output_key_value",
            "human_request",
            "task_complete",
            "return_to_parent",
            "code_execute",
          ].includes(name())
        }
      >
        <div class="space-y-0">
          <CollapsibleSection title="Overview">
            <p class="text-xs text-text-muted leading-relaxed">{props.tool.description}</p>
          </CollapsibleSection>
        </div>
      </Show>
    </>
  )
}
