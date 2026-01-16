import { Show, For, createSignal, createEffect, on } from "solid-js"
import type { ConnectionMode, GitHubMetadata, IntercomMetadata } from "@synatra/core/types"
import {
  Input,
  Checkbox,
  Switch,
  Select,
  type SelectOption,
  CollapsibleSection,
  FileInput,
  RadioGroup,
  type RadioOption,
  IconButton,
  FormField,
} from "../../../ui"
import { AppIcon } from "../../../components"
import { theme } from "../../../app"
import {
  Plugs,
  Circle,
  Plus,
  Globe,
  Copy,
  Check,
  Warning,
  WarningCircle,
  X,
  Desktop,
  Cloud,
  Trash,
  CaretRight,
} from "phosphor-solid-js"
import openaiLight from "../../../assets/images/openai_light.svg"
import openaiDark from "../../../assets/images/openai_dark.svg"
import anthropicLight from "../../../assets/images/anthropic_light.svg"
import anthropicDark from "../../../assets/images/anthropic_dark.svg"
import googleLogo from "../../../assets/images/google.svg"
import type {
  Selection,
  EditableConfigState,
  DatabaseEditorConfig,
  StripeEditorConfig,
  GitHubEditorConfig,
  IntercomEditorConfig,
  RestApiEditorConfig,
  SynatraAiEditorConfig,
  SynatraAiProviderEditorConfig,
} from "./constants"
import type { LlmProvider } from "@synatra/core/types"
import { createEditorState } from "./constants"
import type { Resources, Connectors, AppAccounts } from "../../../app/api"

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

const SSL_OPTIONS: RadioOption[] = [
  { value: "full", label: "Full verification" },
  { value: "verify_ca", label: "Verify CA certificate" },
  { value: "skip_ca", label: "Skip CA verification" },
]

function validatePemCertificate(content: string): string | null {
  if (!content.includes("-----BEGIN CERTIFICATE-----")) {
    return "Invalid format. Must be a PEM certificate starting with -----BEGIN CERTIFICATE-----"
  }
  if (!content.includes("-----END CERTIFICATE-----")) {
    return "Invalid format. Must end with -----END CERTIFICATE-----"
  }
  return null
}

function validatePemPrivateKey(content: string): string | null {
  const pairs = [
    { begin: "-----BEGIN PRIVATE KEY-----", end: "-----END PRIVATE KEY-----" },
    { begin: "-----BEGIN RSA PRIVATE KEY-----", end: "-----END RSA PRIVATE KEY-----" },
    { begin: "-----BEGIN EC PRIVATE KEY-----", end: "-----END EC PRIVATE KEY-----" },
  ]
  const match = pairs.find((p) => content.includes(p.begin))
  if (!match) return "Invalid format. Must be a PEM private key"
  if (!content.includes(match.end)) return "File appears truncated"
  return null
}

const MASK = "••••••••"

function SensitiveInput(props: {
  type?: "text" | "password"
  value: string | undefined
  hasSaved: boolean
  placeholder?: string
  onChange: (value: string | undefined) => void
  class?: string
}) {
  const [editing, setEditing] = createSignal(false)

  const displayValue = () => {
    if (editing()) return props.value ?? ""
    if (props.value !== undefined) return props.value
    if (props.hasSaved) return MASK
    return ""
  }

  const handleFocus = () => {
    setEditing(true)
  }

  const handleBlur = (e: FocusEvent) => {
    const val = (e.target as HTMLInputElement).value
    setEditing(false)
    if (val === "" && props.hasSaved) {
      props.onChange(undefined)
    }
  }

  const handleInput = (e: InputEvent) => {
    props.onChange((e.target as HTMLInputElement).value)
  }

  return (
    <Input
      type={props.type ?? "text"}
      value={displayValue()}
      placeholder={props.placeholder}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onInput={handleInput}
      class={props.class}
    />
  )
}

function DatabaseConfigEditorContent(props: {
  config: DatabaseEditorConfig
  type: "postgres" | "mysql"
  onChange: (config: DatabaseEditorConfig) => void
}) {
  return (
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <FormField label="Host">
          <Input
            type="text"
            value={props.config.host}
            onInput={(e) => props.onChange({ ...props.config, host: e.currentTarget.value })}
            placeholder="localhost"
          />
        </FormField>
        <FormField label="Port">
          <Input
            type="text"
            value={String(props.config.port)}
            onInput={(e) =>
              props.onChange({
                ...props.config,
                port: parseInt(e.currentTarget.value) || (props.type === "mysql" ? 3306 : 5432),
              })
            }
          />
        </FormField>
      </div>

      <FormField label="Database">
        <Input
          type="text"
          value={props.config.database}
          onInput={(e) => props.onChange({ ...props.config, database: e.currentTarget.value })}
          placeholder="myapp"
        />
      </FormField>

      <div class="grid grid-cols-2 gap-2">
        <FormField label="Username">
          <Input
            type="text"
            value={props.config.user}
            onInput={(e) => props.onChange({ ...props.config, user: e.currentTarget.value })}
            placeholder={props.type === "mysql" ? "root" : "postgres"}
          />
        </FormField>
        <FormField label="Password">
          <SensitiveInput
            type="password"
            value={props.config.password}
            hasSaved={props.config.hasPassword}
            onChange={(v) => props.onChange({ ...props.config, password: v })}
          />
        </FormField>
      </div>

      <Checkbox
        checked={props.config.ssl}
        onChange={(e) => props.onChange({ ...props.config, ssl: e.currentTarget.checked })}
        label="Enable SSL"
      />

      <Show when={props.config.ssl}>
        <FormField label="SSL verification">
          <RadioGroup
            value={props.config.sslVerification ?? "full"}
            options={SSL_OPTIONS}
            onChange={(value) =>
              props.onChange({ ...props.config, sslVerification: value as "full" | "verify_ca" | "skip_ca" })
            }
          />
        </FormField>

        <FormField label="CA certificate">
          <FileInput
            value={props.config.caCertificate}
            filename={props.config.caCertificateFilename}
            hasSaved={props.config.hasCaCertificate}
            accept=".pem,.crt,.cer"
            placeholder="Upload CA certificate"
            onValidate={validatePemCertificate}
            onChange={(content, filename) =>
              props.onChange({
                ...props.config,
                caCertificate: content,
                caCertificateFilename: filename,
              })
            }
          />
        </FormField>

        <FormField label="Client certificate">
          <FileInput
            value={props.config.clientCertificate}
            filename={props.config.clientCertificateFilename}
            hasSaved={props.config.hasClientCertificate}
            accept=".pem,.crt,.cer"
            placeholder="Upload client certificate"
            onValidate={validatePemCertificate}
            onChange={(content, filename) =>
              props.onChange({
                ...props.config,
                clientCertificate: content,
                clientCertificateFilename: filename,
              })
            }
          />
        </FormField>

        <FormField label="Client key">
          <FileInput
            value={props.config.clientKey}
            filename={props.config.clientKeyFilename}
            hasSaved={props.config.hasClientKey}
            accept=".pem,.key"
            placeholder="Upload client key"
            onValidate={validatePemPrivateKey}
            onChange={(content, filename) =>
              props.onChange({
                ...props.config,
                clientKey: content,
                clientKeyFilename: filename,
              })
            }
          />
        </FormField>
      </Show>
    </div>
  )
}

function GitHubConfigEditorContent(props: {
  config: GitHubEditorConfig
  appAccounts: AppAccounts
  onChange: (config: GitHubEditorConfig) => void
  onAppConnect?: (appId: string) => void
}) {
  const githubAccounts = () => props.appAccounts.filter((a) => a.appId === "github")

  const selectedAccount = () => githubAccounts().find((a) => a.id === props.config.appAccountId)

  const accountOptions = (): SelectOption<string>[] => {
    const options: SelectOption<string>[] = githubAccounts().map((a) => {
      const meta = a.metadata as GitHubMetadata | null
      return {
        value: a.id,
        label: meta?.accountLogin ? `${a.name} (${meta.accountLogin})` : a.name,
        icon: (iconProps: { class?: string }) => <AppIcon appId="github" class={iconProps.class} />,
      }
    })

    if (props.onAppConnect) {
      options.push({
        value: "__connect_new__",
        label: "Connect new",
        icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
      })
    }

    return options
  }

  const handleChange = (value: string) => {
    if (value === "__connect_new__") {
      props.onAppConnect?.("github")
      return
    }
    props.onChange({ appAccountId: value })
  }

  return (
    <div class="flex flex-col gap-3">
      <FormField label="Account">
        <Select
          value={props.config.appAccountId}
          options={accountOptions()}
          onChange={handleChange}
          placeholder="Select a GitHub account"
        />
      </FormField>

      <Show when={selectedAccount()}>
        {(account) => {
          const meta = account().metadata as GitHubMetadata | null
          return (
            <div class="rounded border border-border-muted bg-surface-muted px-2.5 py-2 text-2xs text-text-muted">
              Connected to {meta?.accountType === "Organization" ? "organization" : "user"}{" "}
              <span class="font-medium text-text">{meta?.accountLogin ?? account().name}</span>
            </div>
          )
        }}
      </Show>
    </div>
  )
}

function IntercomConfigEditorContent(props: {
  config: IntercomEditorConfig
  appAccounts: AppAccounts
  onChange: (config: IntercomEditorConfig) => void
  onAppConnect?: (appId: string) => void
}) {
  const intercomAccounts = () => props.appAccounts.filter((a) => a.appId === "intercom")

  const selectedAccount = () => intercomAccounts().find((a) => a.id === props.config.appAccountId)

  const accountOptions = (): SelectOption<string>[] => {
    const options: SelectOption<string>[] = intercomAccounts().map((a) => {
      const meta = a.metadata as IntercomMetadata | null
      return {
        value: a.id,
        label: meta?.workspaceName ? `${a.name} (${meta.workspaceName})` : a.name,
        icon: (iconProps: { class?: string }) => <AppIcon appId="intercom" class={iconProps.class} />,
      }
    })

    if (props.onAppConnect) {
      options.push({
        value: "__connect_new__",
        label: "Connect new",
        icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
      })
    }

    return options
  }

  const handleChange = (value: string) => {
    if (value === "__connect_new__") {
      props.onAppConnect?.("intercom")
      return
    }
    props.onChange({ appAccountId: value })
  }

  return (
    <div class="flex flex-col gap-3">
      <FormField label="Account">
        <Select
          value={props.config.appAccountId}
          options={accountOptions()}
          onChange={handleChange}
          placeholder="Select an Intercom account"
        />
      </FormField>

      <Show when={selectedAccount()}>
        {(account) => {
          const meta = account().metadata as IntercomMetadata | null
          return (
            <div class="rounded border border-border-muted bg-surface-muted px-2.5 py-2 text-2xs text-text-muted">
              Connected to workspace <span class="font-medium text-text">{meta?.workspaceName ?? account().name}</span>
            </div>
          )
        }}
      </Show>
    </div>
  )
}

function StripeConfigEditorContent(props: {
  config: StripeEditorConfig
  onChange: (config: StripeEditorConfig) => void
}) {
  return (
    <div class="flex flex-col gap-3">
      <FormField label="API Key">
        <SensitiveInput
          type="password"
          value={props.config.apiKey}
          hasSaved={props.config.hasApiKey}
          placeholder="sk_live_..."
          onChange={(v) => props.onChange({ ...props.config, apiKey: v })}
          class="font-code"
        />
      </FormField>

      <FormField label="API Version">
        <Input
          type="text"
          value={props.config.apiVersion}
          onInput={(e) => props.onChange({ ...props.config, apiVersion: e.currentTarget.value })}
        />
      </FormField>
    </div>
  )
}

const AUTH_TYPE_OPTIONS: SelectOption<RestApiEditorConfig["authType"]>[] = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API Key" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
]

const API_KEY_LOCATION_OPTIONS: RadioOption[] = [
  { value: "header", label: "Header" },
  { value: "query", label: "Query Parameter" },
]

function KeyValueList(props: {
  items: Array<{ key: string; value: string }>
  onChange: (items: Array<{ key: string; value: string }>) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}) {
  const items = () => (props.items.length === 0 ? [{ key: "", value: "" }] : props.items)

  const handleAdd = () => {
    props.onChange([...items(), { key: "", value: "" }])
  }

  const handleRemove = (index: number) => {
    const newItems = items().filter((_, i) => i !== index)
    props.onChange(newItems.length === 0 ? [{ key: "", value: "" }] : newItems)
  }

  const handleChange = (index: number, field: "key" | "value", value: string) => {
    props.onChange(items().map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  return (
    <div class="flex flex-col gap-1.5">
      <For each={items()}>
        {(item, index) => (
          <div class="group flex items-center gap-1.5">
            <Input
              type="text"
              value={item.key}
              placeholder={props.keyPlaceholder ?? "Key"}
              onInput={(e) => handleChange(index(), "key", e.currentTarget.value)}
              class="flex-1 font-code text-xs"
            />
            <Input
              type="text"
              value={item.value}
              placeholder={props.valuePlaceholder ?? "Value"}
              onInput={(e) => handleChange(index(), "value", e.currentTarget.value)}
              class="flex-1 font-code text-xs"
            />
            <IconButton
              variant="ghost"
              size="sm"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleRemove(index())}
            >
              <X class="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
      </For>
      <button
        type="button"
        class="flex items-center gap-1 self-start text-xs text-text-muted transition-colors hover:text-text"
        onClick={handleAdd}
      >
        <Plus class="h-3 w-3" />
        Add
      </button>
    </div>
  )
}

function RestApiConfigEditorContent(props: {
  config: RestApiEditorConfig
  onChange: (config: RestApiEditorConfig) => void
}) {
  return (
    <div class="flex flex-col gap-3">
      <FormField label="Base URL">
        <Input
          type="text"
          value={props.config.baseUrl}
          placeholder="https://api.example.com"
          onInput={(e) => props.onChange({ ...props.config, baseUrl: e.currentTarget.value })}
          class="font-code"
        />
      </FormField>

      <FormField label="Authentication">
        <Select
          value={props.config.authType}
          options={AUTH_TYPE_OPTIONS}
          onChange={(v) =>
            props.onChange({
              ...props.config,
              authType: v as RestApiEditorConfig["authType"],
              apiKeyLocation: v === "api_key" ? (props.config.apiKeyLocation ?? "header") : undefined,
              apiKeyName: v === "api_key" ? (props.config.apiKeyName ?? "X-API-Key") : undefined,
            })
          }
        />
      </FormField>

      <Show when={props.config.authType === "api_key"}>
        <FormField label="API Key">
          <SensitiveInput
            type="password"
            value={props.config.apiKeyValue}
            hasSaved={props.config.hasAuthConfig && props.config.originalAuthType === "api_key"}
            placeholder="your-api-key"
            onChange={(v) => props.onChange({ ...props.config, apiKeyValue: v })}
            class="font-code"
          />
        </FormField>
        <FormField label="Location">
          <RadioGroup
            value={props.config.apiKeyLocation ?? "header"}
            options={API_KEY_LOCATION_OPTIONS}
            onChange={(v) => props.onChange({ ...props.config, apiKeyLocation: v as "header" | "query" })}
          />
        </FormField>
        <FormField label={props.config.apiKeyLocation === "query" ? "Parameter Name" : "Header Name"}>
          <Input
            type="text"
            value={props.config.apiKeyName ?? ""}
            placeholder={props.config.apiKeyLocation === "query" ? "api_key" : "X-API-Key"}
            onInput={(e) => props.onChange({ ...props.config, apiKeyName: e.currentTarget.value })}
            class="font-code"
          />
        </FormField>
      </Show>

      <Show when={props.config.authType === "bearer"}>
        <FormField label="Bearer Token">
          <SensitiveInput
            type="password"
            value={props.config.bearerToken}
            hasSaved={props.config.hasAuthConfig && props.config.originalAuthType === "bearer"}
            placeholder="your-token"
            onChange={(v) => props.onChange({ ...props.config, bearerToken: v })}
            class="font-code"
          />
        </FormField>
      </Show>

      <Show when={props.config.authType === "basic"}>
        <div class="grid grid-cols-2 gap-2">
          <FormField label="Username">
            <Input
              type="text"
              value={props.config.basicUsername ?? ""}
              placeholder="username"
              onInput={(e) => props.onChange({ ...props.config, basicUsername: e.currentTarget.value })}
            />
          </FormField>
          <FormField label="Password">
            <SensitiveInput
              type="password"
              value={props.config.basicPassword}
              hasSaved={props.config.hasAuthConfig && props.config.originalAuthType === "basic"}
              onChange={(v) => props.onChange({ ...props.config, basicPassword: v })}
            />
          </FormField>
        </div>
      </Show>

      <FormField label="Headers">
        <KeyValueList
          items={props.config.headers}
          onChange={(headers) => props.onChange({ ...props.config, headers })}
          keyPlaceholder="Header name"
          valuePlaceholder="Header value"
        />
      </FormField>

      <FormField label="Query Parameters">
        <KeyValueList
          items={props.config.queryParams}
          onChange={(queryParams) => props.onChange({ ...props.config, queryParams })}
          keyPlaceholder="Parameter name"
          valuePlaceholder="Parameter value"
        />
      </FormField>
    </div>
  )
}

const LLM_PROVIDERS: { id: LlmProvider; name: string; recommended?: boolean; placeholder: string; helpUrl: string }[] =
  [
    {
      id: "anthropic",
      name: "Anthropic",
      recommended: true,
      placeholder: "sk-ant-api03-...",
      helpUrl: "https://console.anthropic.com/settings/keys",
    },
    {
      id: "openai",
      name: "OpenAI",
      placeholder: "sk-...",
      helpUrl: "https://platform.openai.com/api-keys",
    },
    {
      id: "google",
      name: "Google AI",
      placeholder: "AIza...",
      helpUrl: "https://aistudio.google.com/app/apikey",
    },
  ]

const PROVIDER_ICONS: Record<LlmProvider, { light: string; dark: string; size: string }> = {
  openai: { light: openaiLight, dark: openaiDark, size: "h-5 w-5" },
  anthropic: { light: anthropicLight, dark: anthropicDark, size: "h-3.5 w-3.5" },
  google: { light: googleLogo, dark: googleLogo, size: "h-3.5 w-3.5" },
}

function ProviderIcon(props: { provider: LlmProvider; class?: string }) {
  const icon = PROVIDER_ICONS[props.provider]
  return <img src={theme() === "dark" ? icon.dark : icon.light} alt="" class={props.class ?? icon.size} />
}

function SynatraAiConfigEditorContent(props: {
  config: SynatraAiEditorConfig
  validationErrors?: Partial<Record<LlmProvider, string>>
  onChange: (config: SynatraAiEditorConfig) => void
  onToggleEnabled?: (provider: LlmProvider, enabled: boolean) => void
}) {
  const [expanded, setExpanded] = createSignal<Set<LlmProvider>>(new Set())

  createEffect(() => {
    const providers = Object.keys(props.validationErrors ?? {}) as LlmProvider[]
    if (providers.length > 0) setExpanded((prev) => new Set([...prev, ...providers]))
  })

  const toggleExpanded = (provider: LlmProvider) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const handleProviderChange = (provider: LlmProvider, update: Partial<SynatraAiProviderEditorConfig>) => {
    props.onChange({ ...props.config, [provider]: { ...props.config[provider], ...update } })
  }

  return (
    <div class="flex flex-col gap-2">
      <For each={LLM_PROVIDERS}>
        {(p) => {
          const config = () => props.config[p.id]
          const isConfigured = () => config().hasApiKey || Boolean(config().apiKey)
          const isExpanded = () => expanded().has(p.id)

          return (
            <div class="rounded-lg border border-border">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                onClick={() => toggleExpanded(p.id)}
              >
                <div class="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted">
                  <ProviderIcon provider={p.id} />
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-text">{p.name}</span>
                    <Show when={isConfigured()}>
                      <span
                        class="rounded-full border px-2 py-0.5 text-2xs font-medium"
                        classList={{
                          "border-success/30 bg-success/10 text-success": config().enabled,
                          "border-border bg-surface-muted text-text-muted": !config().enabled,
                        }}
                      >
                        {config().enabled ? "Active" : "Inactive"}
                      </span>
                    </Show>
                  </div>
                </div>
                <span
                  class="h-4 w-4 text-text-muted transition-transform"
                  classList={{ "rotate-90": isExpanded(), "rotate-180": !isExpanded() }}
                >
                  <CaretRight class="h-4 w-4" />
                </span>
              </button>

              <Show when={isExpanded()}>
                <div class="border-t border-border/50 px-3 pb-3 pt-3">
                  <div class="flex flex-col gap-3">
                    <FormField label="API Key">
                      <SensitiveInput
                        type="password"
                        value={config().apiKey}
                        hasSaved={config().hasApiKey}
                        placeholder={p.placeholder}
                        onChange={(v) => handleProviderChange(p.id, { apiKey: v })}
                        class="font-code"
                      />
                      <a
                        href={p.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-1 block text-2xs text-accent hover:underline"
                      >
                        Get your API key from {p.name}
                      </a>
                    </FormField>

                    <Show when={props.validationErrors?.[p.id]}>
                      {(error) => (
                        <div class="flex items-start gap-2 rounded-lg bg-danger-soft p-2">
                          <WarningCircle size={14} weight="fill" class="mt-0.5 shrink-0 text-danger" />
                          <p class="text-xs text-danger">{error()}</p>
                        </div>
                      )}
                    </Show>

                    <FormField label="Base URL">
                      <Input
                        type="text"
                        value={config().baseUrl ?? ""}
                        placeholder="Custom base URL (optional)"
                        onInput={(e) => handleProviderChange(p.id, { baseUrl: e.currentTarget.value || null })}
                        class="font-code"
                      />
                    </FormField>

                    <Show when={isConfigured()}>
                      <div class="flex items-center justify-between rounded-md bg-surface-muted px-2.5 py-2">
                        <span class="text-xs text-text-muted">Enable this provider</span>
                        <Switch
                          checked={config().enabled}
                          onClick={() => {
                            const newEnabled = !config().enabled
                            handleProviderChange(p.id, { enabled: newEnabled })
                            props.onToggleEnabled?.(p.id, newEnabled)
                          }}
                        />
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          )
        }}
      </For>
    </div>
  )
}

function ConnectionModeSectionContent(props: {
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

type DeployMode = "local" | "production"
type ProductionMethod = "docker" | "binary" | "k8s" | "ai" | "aws" | "gcp" | "azure"

function DatabaseConnectionGuideContent(props: {
  type: "postgres" | "mysql"
  connectors: Connectors
  newConnectorToken?: { name: string; token: string } | null
}) {
  const [mode, setMode] = createSignal<DeployMode>("local")
  const [prodMethod, setProdMethod] = createSignal<ProductionMethod>("docker")
  const [copied, setCopied] = createSignal(false)
  const port = () => (props.type === "mysql" ? 3306 : 5432)
  const gatewayUrl = () => {
    const base = import.meta.env.VITE_GATEWAY_URL || "ws://localhost:3003"
    return `${base}/connector/ws`
  }

  const aiPrompt = () => `Help me deploy a Synatra Connector to connect my ${props.type} database.

## Background
Synatra is a platform for building AI agents. To allow agents to query databases in private networks (VPCs), we deploy a "Connector" - a lightweight service that runs inside the VPC and securely relays queries from Synatra's cloud to the database.

## Connection Details (provided by Synatra Console)
- Container image: ghcr.io/synatrahq/connector:latest
- Database type: ${props.type}
- Default database port: ${port()}

## Required Environment Variables
The connector requires these environment variables:
- \`GATEWAY_URL\`: ${gatewayUrl()}
- \`CONNECTOR_TOKEN\`: I will provide this separately (use placeholder <CONNECTOR_TOKEN> in configs)

## Before You Start
Ask me the following questions to determine the best deployment approach:

1. **Infrastructure**: What cloud provider am I using? (AWS, GCP, Azure, or local/on-premise)
2. **Database location**: Where is my ${props.type} database hosted? (e.g., RDS, Cloud SQL, self-managed EC2/VM, local)
3. **Container runtime**: What container orchestration do I have available? (ECS, Cloud Run, Kubernetes, Docker Compose, plain Docker)
4. **Network setup**: Is my database in a private subnet? Do I have existing VPC connectors or NAT gateways?
5. **Permissions**: Do I have permissions to create security groups, IAM roles, or service accounts?

Based on my answers, provide step-by-step deployment instructions.

## After Deployment
Once deployed, remind me to:
1. Check Synatra Console → Settings → Connectors to verify status is "online"
2. Test the database connection using the "Test connection" button`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(aiPrompt())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex gap-1">
        <button
          type="button"
          class="flex items-center gap-1 rounded border px-2 py-1 text-2xs font-medium transition-colors"
          classList={{
            "border-accent bg-accent/10 text-text": mode() === "local",
            "border-border text-text-muted hover:border-border-strong hover:text-text": mode() !== "local",
          }}
          onClick={() => setMode("local")}
        >
          <Desktop class="h-3 w-3" />
          Local
        </button>
        <button
          type="button"
          class="flex items-center gap-1 rounded border px-2 py-1 text-2xs font-medium transition-colors"
          classList={{
            "border-accent bg-accent/10 text-text": mode() === "production",
            "border-border text-text-muted hover:border-border-strong hover:text-text": mode() !== "production",
          }}
          onClick={() => setMode("production")}
        >
          <Cloud class="h-3 w-3" />
          Production
        </button>
      </div>

      <Show when={mode() === "local"}>
        <div class="mt-2 space-y-3 text-2xs">
          <p class="text-text-muted">Test your connection by running the connector locally with Docker.</p>

          <div>
            <p class="mb-1.5 font-medium text-text">1. Start the connector</p>
            <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface-muted px-2 py-1.5 font-code scrollbar-thin">
              {`docker run --rm \\
  -e GATEWAY_URL=${gatewayUrl()} \\
  -e CONNECTOR_TOKEN=${props.newConnectorToken?.token ?? "<your-token>"} \\
  ghcr.io/synatrahq/connector:latest`}
            </code>
          </div>

          <div>
            <p class="mb-1.5 font-medium text-text">2. Configure database host</p>
            <p class="text-text-muted">
              Set the database host to <code class="rounded bg-surface-muted px-1 font-code">host.docker.internal</code>{" "}
              to reach your local {props.type}.
            </p>
            <p class="mt-1.5 text-text-muted">
              On Linux, add{" "}
              <code class="rounded bg-surface-muted px-1 font-code">--add-host=host.docker.internal:host-gateway</code>{" "}
              to the docker run command above.
            </p>
          </div>

          <div>
            <p class="mb-1.5 font-medium text-text">3. Verify connection</p>
            <p class="text-text-muted">
              Confirm the connector status above shows "Online", then use the Test connection button.
            </p>
          </div>
        </div>
      </Show>

      <Show when={mode() === "production"}>
        <div class="mt-2 rounded border border-border bg-surface-muted text-2xs">
          <div class="flex flex-wrap border-b border-border">
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "docker",
                "text-text-muted hover:text-text": prodMethod() !== "docker",
              }}
              onClick={() => setProdMethod("docker")}
            >
              Docker
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "binary",
                "text-text-muted hover:text-text": prodMethod() !== "binary",
              }}
              onClick={() => setProdMethod("binary")}
            >
              Binary
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "k8s",
                "text-text-muted hover:text-text": prodMethod() !== "k8s",
              }}
              onClick={() => setProdMethod("k8s")}
            >
              Kubernetes
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "aws",
                "text-text-muted hover:text-text": prodMethod() !== "aws",
              }}
              onClick={() => setProdMethod("aws")}
            >
              AWS ECS
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "gcp",
                "text-text-muted hover:text-text": prodMethod() !== "gcp",
              }}
              onClick={() => setProdMethod("gcp")}
            >
              GCP
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "azure",
                "text-text-muted hover:text-text": prodMethod() !== "azure",
              }}
              onClick={() => setProdMethod("azure")}
            >
              Azure
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "ai",
                "text-text-muted hover:text-text": prodMethod() !== "ai",
              }}
              onClick={() => setProdMethod("ai")}
            >
              AI Assistant
            </button>
          </div>

          <div class="p-2.5">
            <Show when={prodMethod() === "docker"}>
              <p class="mb-1.5 font-medium text-text">Run with Docker</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`docker run -d --restart=unless-stopped \\
  --name synatra-connector \\
  -e GATEWAY_URL=${gatewayUrl()} \\
  -e CONNECTOR_TOKEN=<your-token> \\
  ghcr.io/synatrahq/connector:latest`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Run this on a VM or server that has network access to your {props.type} database.
              </p>
            </Show>

            <Show when={prodMethod() === "binary"}>
              <p class="mb-1.5 font-medium text-text">1. Download binary</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`# Linux (x64)
curl -L -o connector https://github.com/synatrahq/synatra/releases/latest/download/connector-linux-x64
chmod +x connector

# macOS (Apple Silicon)
curl -L -o connector https://github.com/synatrahq/synatra/releases/latest/download/connector-darwin-arm64
chmod +x connector

# macOS (Intel)
curl -L -o connector https://github.com/synatrahq/synatra/releases/latest/download/connector-darwin-x64
chmod +x connector`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">2. Run connector</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`GATEWAY_URL=${gatewayUrl()} \\
CONNECTOR_TOKEN=<your-token> \\
./connector`}
              </code>
              <p class="mt-1.5 text-text-muted">Use systemd or similar to run as a background service.</p>
            </Show>

            <Show when={prodMethod() === "k8s"}>
              <p class="mb-1.5 font-medium text-text">Kubernetes Deployment</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`apiVersion: apps/v1
kind: Deployment
metadata:
  name: synatra-connector
spec:
  replicas: 1
  selector:
    matchLabels:
      app: synatra-connector
  template:
    metadata:
      labels:
        app: synatra-connector
    spec:
      terminationGracePeriodSeconds: 10
      containers:
      - name: connector
        image: ghcr.io/synatrahq/connector:latest
        env:
        - name: GATEWAY_URL
          value: "${gatewayUrl()}"
        - name: CONNECTOR_TOKEN
          valueFrom:
            secretKeyRef:
              name: synatra-connector
              key: token
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Create secret:{" "}
                <code class="rounded bg-surface px-1 font-code">
                  kubectl create secret generic synatra-connector --from-literal=token=&lt;your-token&gt;
                </code>
              </p>
            </Show>

            <Show when={prodMethod() === "ai"}>
              <p class="mb-1.5 text-text-muted">Copy this prompt to Claude Code, Cursor, or Codex:</p>
              <div class="relative">
                <pre class="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface px-2 py-1.5 font-code text-text scrollbar-thin">
                  {aiPrompt()}
                </pre>
                <button
                  type="button"
                  class="absolute right-1.5 top-1.5 rounded bg-surface-elevated px-2 py-1 text-2xs font-medium text-text-muted transition-colors hover:text-text"
                  onClick={handleCopy}
                >
                  {copied() ? "Copied!" : "Copy"}
                </button>
              </div>
            </Show>

            <Show when={prodMethod() === "aws"}>
              <p class="mb-1.5 font-medium text-text">1. Store token in Secrets Manager</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`aws secretsmanager create-secret \\
  --name synatra-connector-token \\
  --secret-string "<your-token>"`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">2. Register task definition</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`{
  "family": "synatra-connector",
  "networkMode": "awsvpc",
  "executionRoleArn": "arn:aws:iam::<account>:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "connector",
    "image": "ghcr.io/synatrahq/connector:latest",
    "essential": true,
    "stopTimeout": 10,
    "environment": [
      {"name": "GATEWAY_URL", "value": "${gatewayUrl()}"}
    ],
    "secrets": [
      {"name": "CONNECTOR_TOKEN", "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:synatra-connector-token"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/synatra-connector",
        "awslogs-region": "<region>",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512"
}`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">3. Create service</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`aws ecs create-service \\
  --cluster <cluster> \\
  --service-name synatra-connector \\
  --task-definition synatra-connector \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration "awsvpcConfiguration={
    subnets=[<subnet-id>],
    securityGroups=[<sg-id>]
  }"`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Use the same VPC/subnet as your RDS. Execution role needs secretsmanager:GetSecretValue permission.
              </p>
            </Show>

            <Show when={prodMethod() === "gcp"}>
              <p class="mb-1.5 font-medium text-text">Deploy with Cloud Run</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`gcloud run deploy synatra-connector \\
  --image=ghcr.io/synatrahq/connector:latest \\
  --set-env-vars="GATEWAY_URL=${gatewayUrl()}" \\
  --set-secrets="CONNECTOR_TOKEN=synatra-connector-token:latest" \\
  --network=<vpc-name> \\
  --subnet=<subnet-name> \\
  --vpc-egress=private-ranges-only \\
  --no-cpu-throttling \\
  --min-instances=1 \\
  --max-instances=1 \\
  --cpu=0.5 --memory=256Mi \\
  --no-allow-unauthenticated \\
  --region=<region>`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Create secret first:{" "}
                <code class="rounded bg-surface px-1 font-code">
                  echo -n "&lt;token&gt;" | gcloud secrets create synatra-connector-token --data-file=-
                </code>
              </p>
            </Show>

            <Show when={prodMethod() === "azure"}>
              <p class="mb-1.5 font-medium text-text">1. Create environment with VNet</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`az containerapp env create \\
  --name synatra-env \\
  --resource-group <resource-group> \\
  --location <location> \\
  --infrastructure-subnet-resource-id <subnet-id>`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">2. Deploy container app</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`az containerapp create \\
  --name synatra-connector \\
  --resource-group <resource-group> \\
  --environment synatra-env \\
  --image ghcr.io/synatrahq/connector:latest \\
  --env-vars GATEWAY_URL=${gatewayUrl()} \\
  --secrets connector-token=<your-token> \\
  --secret-env-vars CONNECTOR_TOKEN=connector-token \\
  --cpu 0.25 --memory 0.5Gi \\
  --min-replicas 1 \\
  --max-replicas 1`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Use the same VNet as your database. For Key Vault secrets, use{" "}
                <code class="rounded bg-surface px-1 font-code">--secrets "connector-token=keyvaultref:..."</code>
              </p>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
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
    // Get edit state from parent (preserves state across environment switches)
    const editState = props.getEditState(config.environmentId)
    // If no edit state exists yet, create initial state
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
