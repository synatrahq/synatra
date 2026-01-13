import { Show, For, createResource, Switch, Match } from "solid-js"
import { Button, Spinner } from "../../../ui"
import { Check, X, Lightning, Clock, Globe, Plugs, PencilSimple, Plus } from "phosphor-solid-js"
import type { CopilotTriggerRequest, CopilotTriggerConfig } from "./copilot-panel/types"
import { TriggerDiffView } from "./trigger-diff-view"
import { api } from "../../../app"

type TriggerRequestWizardProps = {
  request: CopilotTriggerRequest | null
  onApprove: (requestId: string) => Promise<void>
  onCancel: (requestId: string) => Promise<void>
  approving?: boolean
  cancelling?: boolean
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  webhook: "Webhook",
  schedule: "Schedule",
  app: "App Integration",
}

const MODE_LABELS: Record<string, string> = {
  prompt: "Prompt",
  template: "Template",
  script: "Script",
}

function TriggerTypeIcon(props: { type: string | undefined }) {
  return (
    <Switch fallback={<Lightning class="h-5 w-5 text-accent" weight="duotone" />}>
      <Match when={props.type === "webhook"}>
        <Globe class="h-5 w-5 text-accent" weight="duotone" />
      </Match>
      <Match when={props.type === "schedule"}>
        <Clock class="h-5 w-5 text-accent" weight="duotone" />
      </Match>
      <Match when={props.type === "app"}>
        <Plugs class="h-5 w-5 text-accent" weight="duotone" />
      </Match>
    </Switch>
  )
}

function ConfigDisplay(props: { config: CopilotTriggerConfig }) {
  const fields = () => {
    const c = props.config
    const items: { label: string; value: string }[] = []

    if (c.name) items.push({ label: "Name", value: c.name })
    if (c.type) {
      items.push({ label: "Type", value: TRIGGER_TYPE_LABELS[c.type] ?? c.type })
    }
    if (c.mode) items.push({ label: "Mode", value: MODE_LABELS[c.mode] ?? c.mode })
    if (c.cron) items.push({ label: "Schedule", value: c.cron })
    if (c.timezone) items.push({ label: "Timezone", value: c.timezone })
    if (c.appAccountId) items.push({ label: "App Account", value: c.appAccountId })
    if (c.appEvents?.length) items.push({ label: "App Events", value: c.appEvents.join(", ") })

    return items
  }

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <TriggerTypeIcon type={props.config.type} />
        </div>
        <div>
          <div class="text-sm font-medium text-text">{props.config.name ?? "New Trigger"}</div>
          <div class="text-xs text-text-muted">{TRIGGER_TYPE_LABELS[props.config.type ?? "webhook"] ?? "Trigger"}</div>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-surface p-3 space-y-2">
        <For each={fields()}>
          {(field) => (
            <div class="flex gap-2 text-xs">
              <span class="w-24 shrink-0 text-text-muted">{field.label}</span>
              <span class="text-text font-code break-all">{field.value}</span>
            </div>
          )}
        </For>
      </div>

      <Show when={props.config.template}>
        <div class="space-y-1.5">
          <span class="text-xs text-text-muted">Template</span>
          <div class="rounded border border-border bg-surface-muted p-2 font-code text-xs text-text max-h-32 overflow-y-auto">
            <pre class="whitespace-pre-wrap">{props.config.template}</pre>
          </div>
        </div>
      </Show>

      <Show when={props.config.script}>
        <div class="space-y-1.5">
          <span class="text-xs text-text-muted">Script</span>
          <div class="rounded border border-border bg-surface-muted p-2 font-code text-xs text-text max-h-32 overflow-y-auto">
            <pre class="whitespace-pre-wrap">{props.config.script}</pre>
          </div>
        </div>
      </Show>
    </div>
  )
}

function CreateView(props: { request: CopilotTriggerRequest }) {
  return (
    <div class="space-y-4">
      <div class="flex items-center gap-2 text-success">
        <Plus class="h-4 w-4" weight="bold" />
        <span class="text-xs font-medium">Create New Trigger</span>
      </div>

      <div class="rounded-lg border border-accent/30 bg-accent/5 p-3">
        <p class="text-xs text-text-muted">{props.request.explanation}</p>
      </div>

      <ConfigDisplay config={props.request.config} />
    </div>
  )
}

function UpdateView(props: { request: CopilotTriggerRequest }) {
  const [currentConfig] = createResource(
    () => props.request.triggerId,
    async (triggerId) => {
      if (!triggerId) return null
      const res = await api.api.triggers[":id"].$get({ param: { id: triggerId } })
      if (!res.ok) throw new Error("Failed to fetch trigger")
      const data = await res.json()
      return {
        name: data.name,
        type: data.type,
        mode: data.mode,
        cron: data.cron,
        timezone: data.timezone,
        template: data.template,
        script: data.script,
        appAccountId: data.appAccountId,
        appEvents: data.appEvents,
      } as CopilotTriggerConfig
    },
  )

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-2 text-warning">
        <PencilSimple class="h-4 w-4" weight="bold" />
        <span class="text-xs font-medium">Update Trigger</span>
      </div>

      <div class="rounded-lg border border-accent/30 bg-accent/5 p-3">
        <p class="text-xs text-text-muted">{props.request.explanation}</p>
      </div>

      <Switch>
        <Match when={currentConfig.loading}>
          <div class="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        </Match>
        <Match when={currentConfig.error}>
          <div class="rounded-lg border border-danger/30 bg-danger/5 p-3">
            <p class="text-xs text-danger">Failed to load current trigger configuration</p>
          </div>
        </Match>
        <Match when={currentConfig()}>
          {(config) => <TriggerDiffView before={config()} after={props.request.config} />}
        </Match>
      </Switch>
    </div>
  )
}

export function TriggerRequestWizard(props: TriggerRequestWizardProps) {
  const handleApprove = async () => {
    if (!props.request || props.approving || props.cancelling) return
    await props.onApprove(props.request.id)
  }

  const handleCancel = async () => {
    if (!props.request || props.approving || props.cancelling) return
    await props.onCancel(props.request.id)
  }

  return (
    <div class="flex h-full flex-col">
      <div class="border-b border-border px-3 py-2">
        <h2 class="text-xs font-medium text-text">Trigger Request</h2>
        <Show when={props.request}>
          <p class="mt-0.5 text-2xs text-text-muted">
            {props.request!.action === "create" ? "Create a new trigger" : "Update existing trigger"}
          </p>
        </Show>
      </div>

      <div class="flex-1 overflow-y-auto p-3 scrollbar-thin">
        <Show
          when={props.request}
          fallback={
            <div class="flex h-full items-center justify-center text-xs text-text-muted">
              No pending trigger request
            </div>
          }
        >
          {(request) => (
            <Show when={request().action === "create"} fallback={<UpdateView request={request()} />}>
              <CreateView request={request()} />
            </Show>
          )}
        </Show>
      </div>

      <Show when={props.request}>
        <div class="flex justify-end gap-2 border-t border-border px-3 py-2">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={props.approving || props.cancelling}>
            <X class="h-3 w-3" weight="bold" />
            {props.cancelling ? "Cancelling..." : "Cancel"}
          </Button>
          <Button variant="default" size="sm" onClick={handleApprove} disabled={props.approving || props.cancelling}>
            <Show when={props.approving} fallback={<Check class="h-3 w-3" weight="bold" />}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
            {props.approving ? "Approving..." : "Approve"}
          </Button>
        </div>
      </Show>
    </div>
  )
}
