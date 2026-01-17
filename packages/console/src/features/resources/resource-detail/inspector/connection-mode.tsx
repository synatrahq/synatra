import { Show, createSignal } from "solid-js"
import { Plugs, Circle, Plus, Globe, Copy, Check, Warning, X } from "phosphor-solid-js"
import type { ConnectionMode } from "@synatra/core/types"
import { Select, FormField, type SelectOption } from "../../../../ui"
import type { Connectors } from "../../../../app/api"

export function ConnectionModeSectionContent(props: {
  connectionMode: ConnectionMode
  connectorId: string | null
  connectors: Connectors
  newConnectorToken?: { name: string; token: string } | null
  onChange: (mode: ConnectionMode, connectorId: string | null) => void
  onConnectorCreate?: () => void
  onConnectorTokenDismiss?: () => void
}) {
  const [copied, setCopied] = createSignal(false)

  const connectorOptions = (): SelectOption<string>[] => {
    const options: SelectOption<string>[] = props.connectors.map((c) => ({
      value: c.id,
      label: c.name,
      icon: (iconProps: { class?: string }) => <Plugs class={iconProps.class} />,
    }))

    if (props.onConnectorCreate) {
      options.push({
        value: "__create_new__",
        label: "Create new",
        icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
      })
    }

    return options
  }

  const handleConnectorChange = (value: string) => {
    if (value === "__create_new__") {
      props.onConnectorCreate?.()
      return
    }
    props.onChange(props.connectionMode, value || null)
  }

  const handleCopyToken = async () => {
    if (props.newConnectorToken) {
      await navigator.clipboard.writeText(props.newConnectorToken.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const gatewayUrl = () => {
    const base = import.meta.env.VITE_GATEWAY_URL || "ws://localhost:3003"
    return `${base}/connector/ws`
  }

  const selectedConnector = () => props.connectors.find((c) => c.id === props.connectorId)

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2">
        <button
          type="button"
          class="flex flex-col items-start rounded border px-3 py-2 text-left transition-colors"
          classList={{
            "border-accent bg-accent/5": props.connectionMode === "direct",
            "border-border hover:border-border-strong": props.connectionMode !== "direct",
          }}
          onClick={() => props.onChange("direct", null)}
        >
          <div class="flex items-center gap-1.5">
            <Globe class="h-3 w-3" />
            <span class="text-xs font-medium text-text">Direct</span>
          </div>
          <p class="mt-1 text-2xs text-text-muted">For databases with public endpoints</p>
          <p class="mt-0.5 text-2xs text-text-muted/70">Supabase, PlanetScale, Neon, MongoDB Atlas, etc.</p>
        </button>
        <button
          type="button"
          class="flex flex-col items-start rounded border px-3 py-2 text-left transition-colors"
          classList={{
            "border-accent bg-accent/5": props.connectionMode === "connector",
            "border-border hover:border-border-strong": props.connectionMode !== "connector",
          }}
          onClick={() => props.onChange("connector", props.connectorId ?? props.connectors[0]?.id ?? null)}
        >
          <div class="flex items-center gap-1.5">
            <Plugs class="h-3 w-3" />
            <span class="text-xs font-medium text-text">Connector</span>
          </div>
          <p class="mt-1 text-2xs text-text-muted">For databases in private networks</p>
          <p class="mt-0.5 text-2xs text-text-muted/70">AWS RDS, GCP Cloud SQL, Azure Database, on-premise, etc.</p>
        </button>
      </div>
      <Show when={props.connectionMode === "connector"}>
        <FormField label="Connector">
          <Select
            value={props.connectorId ?? ""}
            options={connectorOptions()}
            onChange={handleConnectorChange}
            placeholder="Select a connector"
          />
        </FormField>
        <Show when={selectedConnector()} keyed>
          {(connector) => (
            <div class="flex items-center gap-1.5 text-2xs text-text-muted">
              <Circle
                class="h-2 w-2"
                classList={{
                  "text-success": connector.status === "online",
                  "text-text-muted": connector.status !== "online",
                }}
                weight="fill"
              />
              <span class="capitalize">{connector.status}</span>
            </div>
          )}
        </Show>
        <Show when={props.newConnectorToken}>
          {(token) => (
            <div class="rounded border border-warning bg-warning-soft p-2.5 text-2xs">
              <div class="mb-2 flex items-start justify-between gap-2">
                <div class="flex items-start gap-1.5">
                  <Warning class="mt-0.5 h-3 w-3 shrink-0 text-warning" weight="fill" />
                  <span class="text-warning">Copy token now. You won't see it again.</span>
                </div>
                <button
                  type="button"
                  class="text-warning hover:text-warning/80"
                  onClick={() => props.onConnectorTokenDismiss?.()}
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
              <div class="flex items-stretch gap-1.5">
                <code class="flex flex-1 items-center overflow-x-auto rounded border border-border bg-surface px-2 font-code text-text scrollbar-thin">
                  {token().token}
                </code>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
                  onClick={handleCopyToken}
                >
                  <Show when={copied()} fallback={<Copy class="h-3.5 w-3.5" />}>
                    <Check class="h-3.5 w-3.5 text-success" />
                  </Show>
                </button>
              </div>
              <div class="mt-2">
                <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1 font-code text-text-muted scrollbar-thin">
                  {`GATEWAY_URL=${gatewayUrl()}
CONNECTOR_TOKEN=${token().token}`}
                </code>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}
