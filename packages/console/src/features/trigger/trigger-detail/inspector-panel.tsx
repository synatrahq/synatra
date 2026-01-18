import { Show, Switch, Match } from "solid-js"
import type { Selection } from "./constants"
import { SettingsInspector, type AppAccountInfo } from "./inspector/settings-inspector"
import { EnvironmentInspector } from "./inspector/environment-inspector"
import { PromptInspector, type PromptMode, type PromptVersionMode } from "./inspector/prompt-inspector"
import type { Prompts, Channels } from "../../../app/api"

type AgentRelease = {
  id: string
  version: string
  createdAt: string
}

type TriggerEnvironmentInfo = {
  id: string
  triggerId: string
  environmentId: string
  channelId: string
  webhookSecret: string | null
  debugSecret: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  environment: { id: string; name: string; slug: string; color: string }
  channel: { id: string; name: string; slug: string }
}

type ReleaseInfo = {
  id: string
  version: string
  payloadSchema?: unknown
}

type PromptReleaseItem = {
  id: string
  version: string
  createdAt: string
}

type InspectorPanelProps = {
  selection: Selection | null
  triggerSlug: string
  triggerType: "webhook" | "schedule" | "app"
  orgSlug: string
  apiBaseUrl: string
  agentVersionMode: "current" | "fixed"
  agentReleaseId: string | null
  agentReleases: AgentRelease[]
  environments: TriggerEnvironmentInfo[]
  availableChannels: Channels
  releases?: ReleaseInfo[]
  currentReleaseId?: string | null
  payloadSchema: Record<string, unknown>
  prompts: Prompts
  promptMode: PromptMode
  selectedPromptId: string
  promptVersionMode: PromptVersionMode
  promptReleases: PromptReleaseItem[]
  selectedPromptReleaseId: string | null
  promptContent: string
  script: string
  currentPromptInputSchema?: unknown
  input?: string
  inputPlaceholder?: string
  appAccounts: AppAccountInfo[]
  selectedAppAccountId: string | null
  appEvents: string[]
  onTypeChange: (type: "webhook" | "schedule" | "app") => void
  onAgentVersionModeChange: (mode: "current" | "fixed") => void
  onAgentReleaseIdChange: (id: string | null) => void
  onCronChange: (cron: string) => void
  onTimezoneChange: (timezone: string) => void
  cron: string
  timezone: string
  onAppAccountChange: (id: string | null) => void
  onAppEventsChange: (events: string[]) => void
  onAppConnect?: (appId: string | null) => void
  onRegenerateWebhookSecret: (environmentId: string) => Promise<void>
  onRegenerateDebugSecret: (environmentId: string) => Promise<void>
  onUpdateEnvironmentChannel: (environmentId: string, channelId: string) => Promise<void>
  onPromptModeChange: (mode: PromptMode) => void
  onPromptIdChange: (id: string) => void
  onPromptVersionModeChange: (mode: PromptVersionMode) => void
  onPromptReleaseIdChange: (id: string | null) => void
  onPromptContentChange: (content: string) => void
  onScriptChange: (script: string) => void
  onPayloadSchemaChange: (schema: Record<string, unknown>) => void
  onInputChange?: (input: string) => void
}

export function InspectorPanel(props: InspectorPanelProps) {
  const selectedEnvironment = () => {
    const sel = props.selection
    if (sel?.type !== "environment") return null
    return props.environments.find((e) => e.environmentId === sel.environmentId)
  }

  return (
    <div class="flex h-full flex-col overflow-y-auto bg-surface-elevated scrollbar-thin">
      <Show
        when={props.selection}
        fallback={
          <div class="flex h-full items-center justify-center text-xs text-text-muted">
            Select an item from the outline
          </div>
        }
      >
        <Switch>
          <Match when={props.selection?.type === "settings"}>
            <SettingsInspector
              slug={props.triggerSlug}
              type={props.triggerType}
              agentVersionMode={props.agentVersionMode}
              agentReleaseId={props.agentReleaseId}
              agentReleases={props.agentReleases}
              onTypeChange={props.onTypeChange}
              onAgentVersionModeChange={props.onAgentVersionModeChange}
              onAgentReleaseIdChange={props.onAgentReleaseIdChange}
              cron={props.cron}
              timezone={props.timezone}
              onCronChange={props.onCronChange}
              onTimezoneChange={props.onTimezoneChange}
              appAccounts={props.appAccounts}
              selectedAppAccountId={props.selectedAppAccountId}
              appEvents={props.appEvents}
              onAppAccountChange={props.onAppAccountChange}
              onAppEventsChange={props.onAppEventsChange}
              onAppConnect={props.onAppConnect}
            />
          </Match>
          <Match when={props.selection?.type === "environment" && selectedEnvironment()}>
            <EnvironmentInspector
              env={selectedEnvironment()!}
              triggerSlug={props.triggerSlug}
              triggerType={props.triggerType}
              orgSlug={props.orgSlug}
              apiBaseUrl={props.apiBaseUrl}
              availableChannels={props.availableChannels}
              releases={props.releases}
              currentReleaseId={props.currentReleaseId}
              payloadSchema={props.payloadSchema}
              onRegenerateWebhookSecret={() => props.onRegenerateWebhookSecret(selectedEnvironment()!.environmentId)}
              onRegenerateDebugSecret={() => props.onRegenerateDebugSecret(selectedEnvironment()!.environmentId)}
              onUpdateChannel={(channelId) =>
                props.onUpdateEnvironmentChannel(selectedEnvironment()!.environmentId, channelId)
              }
            />
          </Match>
          <Match when={props.selection?.type === "prompt"}>
            <PromptInspector
              triggerType={props.triggerType}
              promptMode={props.promptMode}
              onPromptModeChange={props.onPromptModeChange}
              prompts={props.prompts}
              selectedPromptId={props.selectedPromptId}
              onPromptIdChange={props.onPromptIdChange}
              promptVersionMode={props.promptVersionMode}
              onPromptVersionModeChange={props.onPromptVersionModeChange}
              promptReleases={props.promptReleases}
              selectedPromptReleaseId={props.selectedPromptReleaseId}
              onPromptReleaseIdChange={props.onPromptReleaseIdChange}
              promptContent={props.promptContent}
              onPromptContentChange={props.onPromptContentChange}
              script={props.script}
              onScriptChange={props.onScriptChange}
              payloadSchema={props.payloadSchema}
              onPayloadSchemaChange={props.onPayloadSchemaChange}
              currentPromptInputSchema={props.currentPromptInputSchema}
              input={props.input}
              onInputChange={props.onInputChange}
              inputPlaceholder={props.inputPlaceholder}
              appId={props.appAccounts.find((a) => a.id === props.selectedAppAccountId)?.appId ?? null}
              appEvents={props.appEvents}
            />
          </Match>
        </Switch>
      </Show>
    </div>
  )
}
