import { Show, createEffect, on } from "solid-js"
import type { ConnectionMode } from "@synatra/core/types"
import type { LlmProvider } from "@synatra/core/types"
import { CollapsibleSection } from "../../../ui"
import type {
  Selection,
  EditableConfigState,
  DatabaseEditorConfig,
  StripeEditorConfig,
  GitHubEditorConfig,
  IntercomEditorConfig,
  RestApiEditorConfig,
  SynatraAiEditorConfig,
} from "./constants"
import { createEditorState } from "./constants"
import type { Resources, Connectors, AppAccounts } from "../../../app/api"
import { DatabaseConfigEditorContent } from "./inspector/database-editor"
import { StripeConfigEditorContent } from "./inspector/stripe-editor"
import { GitHubConfigEditorContent } from "./inspector/github-editor"
import { IntercomConfigEditorContent } from "./inspector/intercom-editor"
import { RestApiConfigEditorContent } from "./inspector/restapi-editor"
import { SynatraAiConfigEditorContent } from "./inspector/synatra-ai-editor"
import { ConnectionModeSectionContent } from "./inspector/connection-mode"
import { DatabaseConnectionGuideContent } from "./inspector/connection-guide"

export type TestConnectionResult = { success: boolean; error?: string }

type InspectorPanelProps = {
  resource: Resources[number]
  selection: Selection | null
  connectors: Connectors
  appAccounts?: AppAccounts
  pendingConnectorId?: string | null
  newConnectorToken?: { name: string; token: string } | null
  testResult?: TestConnectionResult | null
  llmValidationErrors?: Partial<Record<LlmProvider, string>>
  getEditState: (environmentId: string) => EditableConfigState | undefined
  onEditStateChange?: (environmentId: string, editState: EditableConfigState) => void
  onToggleLlmEnabled?: (provider: LlmProvider, enabled: boolean) => void
  onAppConnect?: (appId: string) => void
  onConnectorCreate?: () => void
  onConnectorTokenDismiss?: () => void
}

function EnvironmentConfigEditor(props: {
  resource: Resources[number]
  config: Resources[number]["configs"][number]
  editState: EditableConfigState
  connectors: Connectors
  appAccounts: AppAccounts
  pendingConnectorId?: string | null
  newConnectorToken?: { name: string; token: string } | null
  testResult?: TestConnectionResult | null
  llmValidationErrors?: Partial<Record<LlmProvider, string>>
  onEditStateChange?: (environmentId: string, editState: EditableConfigState) => void
  onToggleLlmEnabled?: (provider: LlmProvider, enabled: boolean) => void
  onAppConnect?: (appId: string) => void
  onConnectorCreate?: () => void
  onConnectorTokenDismiss?: () => void
}) {
  createEffect(
    on(
      () => [props.pendingConnectorId, props.connectors] as const,
      ([connectorId, connectors]) => {
        if (!connectorId) return
        if (props.editState.connectorId === connectorId) return
        if (connectors.some((c) => c.id === connectorId)) {
          props.onEditStateChange?.(props.config.environmentId, {
            ...props.editState,
            connectionMode: "connector",
            connectorId,
          })
        }
      },
    ),
  )

  const updateEditState = (updates: Partial<EditableConfigState>) => {
    props.onEditStateChange?.(props.config.environmentId, { ...props.editState, ...updates })
  }

  const handleDatabaseChange = (database: DatabaseEditorConfig) => updateEditState({ database })
  const handleStripeChange = (stripe: StripeEditorConfig) => updateEditState({ stripe })
  const handleGitHubChange = (github: GitHubEditorConfig) => updateEditState({ github })
  const handleIntercomChange = (intercom: IntercomEditorConfig) => updateEditState({ intercom })
  const handleRestApiChange = (restapi: RestApiEditorConfig) => updateEditState({ restapi })
  const handleSynatraAiChange = (synatraAi: SynatraAiEditorConfig) => updateEditState({ synatraAi })

  const handleConnectionModeChange = (connectionMode: ConnectionMode, connectorId: string | null) => {
    updateEditState({ connectionMode, connectorId })
  }

  const isDatabase = () => props.resource.type === "postgres" || props.resource.type === "mysql"

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <div class="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          style={{ background: props.config.environmentColor ?? "#3B82F6" }}
        />
        <h2 class="text-xs font-medium text-text">{props.config.environmentName}</h2>
        <span class="text-xs text-text-muted">({props.config.environmentSlug})</span>
      </div>

      <Show when={props.testResult}>
        {(result) => (
          <div
            class="mx-3 mt-3 rounded px-2.5 py-2 text-xs"
            classList={{
              "bg-success-soft text-success": result().success,
              "bg-danger-soft text-danger": !result().success,
            }}
          >
            {result().success ? "Connection successful!" : (result().error ?? "Connection failed")}
          </div>
        )}
      </Show>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={isDatabase()}>
          <CollapsibleSection title="Connection mode" defaultExpanded>
            <ConnectionModeSectionContent
              connectionMode={props.editState.connectionMode}
              connectorId={props.editState.connectorId}
              connectors={props.connectors}
              newConnectorToken={props.newConnectorToken}
              onChange={handleConnectionModeChange}
              onConnectorCreate={props.onConnectorCreate}
              onConnectorTokenDismiss={props.onConnectorTokenDismiss}
            />
          </CollapsibleSection>
          <Show when={props.editState.connectionMode === "connector"}>
            <CollapsibleSection title="Setup guide" defaultExpanded>
              <DatabaseConnectionGuideContent
                type={props.resource.type as "postgres" | "mysql"}
                connectors={props.connectors}
                newConnectorToken={props.newConnectorToken}
              />
            </CollapsibleSection>
          </Show>
        </Show>
        <Show when={isDatabase() && props.editState.database}>
          {(dbConfig) => (
            <CollapsibleSection title="Connection settings" defaultExpanded>
              <DatabaseConfigEditorContent
                config={dbConfig()}
                type={props.resource.type as "postgres" | "mysql"}
                onChange={handleDatabaseChange}
              />
            </CollapsibleSection>
          )}
        </Show>
        <Show when={props.resource.type === "stripe" && props.editState.stripe}>
          {(stripeConfig) => (
            <CollapsibleSection title="API settings" defaultExpanded>
              <StripeConfigEditorContent config={stripeConfig()} onChange={handleStripeChange} />
            </CollapsibleSection>
          )}
        </Show>
        <Show when={props.resource.type === "github" && props.editState.github}>
          {(githubConfig) => (
            <CollapsibleSection title="Connection settings" defaultExpanded>
              <GitHubConfigEditorContent
                config={githubConfig()}
                appAccounts={props.appAccounts}
                onChange={handleGitHubChange}
                onAppConnect={props.onAppConnect}
              />
            </CollapsibleSection>
          )}
        </Show>
        <Show when={props.resource.type === "intercom" && props.editState.intercom}>
          {(intercomConfig) => (
            <CollapsibleSection title="Connection settings" defaultExpanded>
              <IntercomConfigEditorContent
                config={intercomConfig()}
                appAccounts={props.appAccounts}
                onChange={handleIntercomChange}
                onAppConnect={props.onAppConnect}
              />
            </CollapsibleSection>
          )}
        </Show>
        <Show when={props.resource.type === "restapi"}>
          <CollapsibleSection title="Connection mode" defaultExpanded>
            <ConnectionModeSectionContent
              connectionMode={props.editState.connectionMode}
              connectorId={props.editState.connectorId}
              connectors={props.connectors}
              newConnectorToken={props.newConnectorToken}
              onChange={handleConnectionModeChange}
              onConnectorCreate={props.onConnectorCreate}
              onConnectorTokenDismiss={props.onConnectorTokenDismiss}
            />
          </CollapsibleSection>
        </Show>
        <Show when={props.resource.type === "restapi" && props.editState.restapi}>
          {(restConfig) => (
            <CollapsibleSection title="API settings" defaultExpanded>
              <RestApiConfigEditorContent config={restConfig()} onChange={handleRestApiChange} />
            </CollapsibleSection>
          )}
        </Show>
        <Show when={props.resource.type === "synatra_ai" && props.editState.synatraAi}>
          {(synatraConfig) => (
            <>
              <CollapsibleSection title="Use your API keys" defaultExpanded>
                <SynatraAiConfigEditorContent
                  config={synatraConfig()}
                  validationErrors={props.llmValidationErrors}
                  onChange={handleSynatraAiChange}
                  onToggleEnabled={props.onToggleLlmEnabled}
                />
              </CollapsibleSection>
              <CollapsibleSection title="Synatra managed">
                <div class="flex flex-col items-center justify-center rounded border border-dashed border-border py-6 text-center">
                  <span class="text-xs font-medium text-text-muted">Coming soon</span>
                  <span class="mt-1 text-2xs text-text-muted">
                    Use Synatra's managed API keys without managing your own
                  </span>
                </div>
              </CollapsibleSection>
            </>
          )}
        </Show>
      </div>
    </div>
  )
}

export function InspectorPanel(props: InspectorPanelProps) {
  const selectedConfig = () => {
    if (!props.selection) return null
    return props.resource.configs.find((c) => c.environmentId === props.selection!.environmentId)
  }

  const currentEditState = () => {
    const config = selectedConfig()
    if (!config) return null
    const editState = props.getEditState(config.environmentId)
    return editState ?? createEditorState(props.resource.type, config.config, config.connectionMode, config.connectorId)
  }

  return (
    <div class="flex h-full flex-col overflow-hidden bg-surface-elevated">
      <Show
        when={selectedConfig()}
        fallback={
          <div class="flex h-full items-center justify-center text-xs text-text-muted">
            Select an environment to configure
          </div>
        }
      >
        {(config) => (
          <Show when={currentEditState()}>
            {(editState) => (
              <EnvironmentConfigEditor
                resource={props.resource}
                config={config()}
                editState={editState()}
                connectors={props.connectors}
                appAccounts={props.appAccounts ?? []}
                pendingConnectorId={props.pendingConnectorId}
                newConnectorToken={props.newConnectorToken}
                testResult={props.testResult}
                llmValidationErrors={props.llmValidationErrors}
                onEditStateChange={props.onEditStateChange}
                onToggleLlmEnabled={props.onToggleLlmEnabled}
                onAppConnect={props.onAppConnect}
                onConnectorCreate={props.onConnectorCreate}
                onConnectorTokenDismiss={props.onConnectorTokenDismiss}
              />
            )}
          </Show>
        )}
      </Show>
    </div>
  )
}
