import { Show, For, Switch, Match, Index } from "solid-js"
import { Badge, TablePagination, type JSONSchema } from "../../ui"
import { getIconComponent, ICON_COLORS } from "../index"
import { Robot } from "phosphor-solid-js"
import type { HumanRequestFieldConfig, HumanRequestFormConfig, HumanRequestSelectRowsConfig } from "@synatra/core/types"
import type { ThreadHumanRequest, ThreadHumanResponse } from "../../app/api"

type SubagentInfo = {
  name: string
  icon: string | null
  iconColor: string | null
}

function formatValue(value: unknown, schema?: JSONSchema): string {
  if (value === undefined || value === null) return "-"
  if (schema?.oneOf) {
    const option = schema.oneOf.find((o) => o.const === value)
    if (option?.title) return option.title
  }
  if (schema?.enum) return String(value)
  const format = schema?.format
  if (format === "date" && typeof value === "string") return value
  if (format === "date-time" && typeof value === "string") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString()
  }
  if (format === "time" && typeof value === "string") return value
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function SubmittedFormDisplay(props: { data: Record<string, unknown>; schema?: JSONSchema }) {
  const properties = () => props.schema?.properties ?? {}
  const entries = () => Object.entries(props.data)

  return (
    <div class="space-y-2 rounded-lg border border-border bg-surface p-3">
      <For each={entries()}>
        {([name, value]) => {
          const fieldSchema = properties()[name] as JSONSchema | undefined
          const label = fieldSchema?.title ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          return (
            <div class="flex justify-between items-start gap-4">
              <span class="text-xs text-text-muted">{label}</span>
              <span class="text-xs text-text text-right">{formatValue(value, fieldSchema)}</span>
            </div>
          )
        }}
      </For>
    </div>
  )
}

function SubmittedConfirmDisplay(props: { data: { confirmed: boolean; reason?: string } }) {
  return (
    <div class="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
      <Show
        when={props.data.confirmed}
        fallback={
          <>
            <div class="w-4 h-4 rounded-full bg-danger flex items-center justify-center">
              <div class="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            <span class="text-xs text-text">Rejected</span>
            <Show when={props.data.reason}>
              <span class="text-xs text-text-muted">— {props.data.reason}</span>
            </Show>
          </>
        }
      >
        <div class="w-4 h-4 rounded-full bg-success flex items-center justify-center">
          <div class="w-1.5 h-1.5 rounded-full bg-white" />
        </div>
        <span class="text-xs text-success">Confirmed</span>
      </Show>
    </div>
  )
}

function SubmittedSelectRowsDisplay(props: {
  data: { selectedRows: Record<string, unknown>[] }
  config: HumanRequestSelectRowsConfig
}) {
  const columns = () => props.config.columns ?? []
  const rows = () => props.data.selectedRows ?? []

  return (
    <div class="rounded-lg border border-border overflow-x-auto">
      <TablePagination data={rows()}>
        {(paginatedRows, info) => (
          <>
            <table class="w-full text-xs">
              <thead class="bg-surface-muted">
                <tr>
                  <For each={columns()}>
                    {(col) => <th class="px-3 py-2 text-left text-text-muted font-medium">{col.label}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <Show when={paginatedRows.length === 0}>
                  <tr>
                    <td colspan={columns().length} class="px-3 py-4 text-center text-text-muted text-2xs">
                      No rows selected
                    </td>
                  </tr>
                </Show>
                <For each={paginatedRows}>
                  {(row, idx) => (
                    <tr class={idx() > 0 ? "border-t border-border" : ""}>
                      <For each={columns()}>
                        {(col) => <td class="px-3 py-2 text-text">{String(row[col.key] ?? "")}</td>}
                      </For>
                    </tr>
                  )}
                </For>
                <Index each={Array(info.padRows)}>
                  {() => (
                    <tr class="border-t border-transparent">
                      <For each={columns()}>{() => <td class="px-3 py-2">&nbsp;</td>}</For>
                    </tr>
                  )}
                </Index>
              </tbody>
            </table>
            <Show when={rows().length > 0}>
              <div class="px-3 py-2 text-xs text-success border-t border-border bg-success/5">
                {rows().length} row{rows().length > 1 ? "s" : ""} selected
              </div>
            </Show>
          </>
        )}
      </TablePagination>
    </div>
  )
}

function SubmittedQuestionDisplay(props: { data: { answers: Record<string, unknown> } }) {
  const entries = () => Object.entries(props.data.answers ?? {})

  return (
    <div class="space-y-2 rounded-lg border border-border bg-surface p-3">
      <For each={entries()}>
        {([question, answer]) => (
          <div class="flex justify-between items-start gap-4">
            <span class="text-xs text-text-muted">{question}</span>
            <span class="text-xs text-text text-right">
              {Array.isArray(answer) ? answer.join(", ") : String(answer ?? "-")}
            </span>
          </div>
        )}
      </For>
    </div>
  )
}

type SubmittedFieldsPanelProps = {
  request: ThreadHumanRequest
  response?: ThreadHumanResponse | null
  subagent?: SubagentInfo | null
}

function SubagentHeader(props: { subagent: SubagentInfo }) {
  const color = () => ICON_COLORS.find((c) => c.id === props.subagent.iconColor)?.value ?? ICON_COLORS[0].value
  const IconComponent = props.subagent.icon ? getIconComponent(props.subagent.icon) : null

  return (
    <div
      class="flex items-center gap-2 mb-3 pb-2 border-b"
      style={{ "border-color": `color-mix(in srgb, ${color()} 20%, transparent)` }}
    >
      <span
        class="flex shrink-0 items-center justify-center rounded-full"
        style={{
          width: "20px",
          height: "20px",
          "background-color": `color-mix(in srgb, ${color()} 15%, transparent)`,
        }}
      >
        {IconComponent ? (
          <IconComponent size={11} weight="duotone" style={{ color: color() }} />
        ) : (
          <Robot size={11} weight="duotone" style={{ color: color() }} />
        )}
      </span>
      <div class="flex items-baseline gap-1">
        <span class="text-xs font-medium" style={{ color: color() }}>
          {props.subagent.name}
        </span>
        <span class="text-2xs text-text-muted">asked</span>
      </div>
    </div>
  )
}

export function SubmittedFieldsPanel(props: SubmittedFieldsPanelProps) {
  const fields = () => props.request.config?.fields ?? []
  const responseData = () => (props.response?.data as { responses?: Record<string, unknown> })?.responses ?? {}

  const statusLabel = () => {
    switch (props.request.status) {
      case "responded":
        return "Submitted"
      case "cancelled":
        return "Cancelled"
      case "skipped":
        return "Skipped"
      case "timeout":
        return "Timed out"
      default:
        return props.request.status
    }
  }

  const statusVariant = () => {
    switch (props.request.status) {
      case "responded":
        return "success" as const
      case "cancelled":
      case "timeout":
        return "secondary" as const
      default:
        return "secondary" as const
    }
  }

  return (
    <div class="rounded-lg border border-border bg-surface-muted/30 p-3 space-y-3">
      <Show when={props.subagent}>{(sub) => <SubagentHeader subagent={sub()} />}</Show>
      <div class="flex flex-wrap items-center gap-1.5 mb-1">
        <Badge variant={statusVariant()} class="text-2xs">
          {statusLabel()}
        </Badge>
      </div>

      <Show when={props.request.title}>
        <h4 class="text-sm font-medium text-text">{props.request.title}</h4>
      </Show>
      <Show when={props.request.description}>
        <p class="text-xs text-text-muted">{props.request.description}</p>
      </Show>

      <Show when={props.request.status === "responded" && Object.keys(responseData()).length > 0}>
        <div class="space-y-2">
          <For each={fields()}>
            {(field: HumanRequestFieldConfig) => {
              const data = responseData()[field.key]
              if (!data) return null

              return (
                <div class="space-y-1">
                  <Show when={fields().length > 1}>
                    <span class="text-2xs text-text-muted font-medium">{field.key}</span>
                  </Show>
                  <Switch>
                    <Match when={field.kind === "form"}>
                      <SubmittedFormDisplay
                        data={(data as { values: Record<string, unknown> }).values ?? {}}
                        schema={(field as HumanRequestFormConfig).schema as JSONSchema}
                      />
                    </Match>
                    <Match when={field.kind === "confirm"}>
                      <SubmittedConfirmDisplay data={data as { confirmed: boolean; reason?: string }} />
                    </Match>
                    <Match when={field.kind === "select_rows"}>
                      <SubmittedSelectRowsDisplay
                        data={data as { selectedRows: Record<string, unknown>[] }}
                        config={field as HumanRequestSelectRowsConfig}
                      />
                    </Match>
                    <Match when={field.kind === "question"}>
                      <SubmittedQuestionDisplay data={data as { answers: Record<string, unknown> }} />
                    </Match>
                  </Switch>
                </div>
              )
            }}
          </For>
        </div>
      </Show>

      <Show when={props.request.status !== "responded"}>
        <div class="rounded-lg border border-border bg-surface p-3">
          <p class="text-xs text-text-muted">
            <Show when={props.request.status === "cancelled"}>This request was cancelled.</Show>
            <Show when={props.request.status === "skipped"}>
              <Show
                when={(props.response?.data as { reason?: string } | undefined)?.reason}
                fallback="This request was skipped."
              >
                {(reason) => <span class="italic">"{reason()}"</span>}
              </Show>
            </Show>
            <Show when={props.request.status === "timeout"}>This request timed out.</Show>
          </p>
        </div>
      </Show>
    </div>
  )
}
