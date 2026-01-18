import { Show, createSignal, createEffect } from "solid-js"
import { Copy, Check, ArrowsClockwise, Warning, Info } from "phosphor-solid-js"
import {
  FormField,
  Input,
  IconButton,
  Button,
  Spinner,
  Modal,
  ModalContainer,
  ModalFooter,
  Select,
  CollapsibleSection,
} from "../../../../ui"

type ChannelInfo = {
  id: string
  name: string
  slug: string
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

type EnvironmentInspectorProps = {
  env: TriggerEnvironmentInfo
  triggerSlug: string
  triggerType: "webhook" | "schedule" | "app"
  orgSlug: string
  apiBaseUrl: string
  availableChannels: ChannelInfo[]
  releases?: ReleaseInfo[]
  currentReleaseId?: string | null
  payloadSchema?: unknown
  onRegenerateWebhookSecret: () => Promise<void>
  onRegenerateDebugSecret: () => Promise<void>
  onUpdateChannel: (channelId: string) => Promise<void>
}

function CopyButton(props: { value: string }) {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <IconButton variant="ghost" size="sm" onClick={handleCopy}>
      <Show when={copied()} fallback={<Copy class="h-3.5 w-3.5" />}>
        <Check class="h-3.5 w-3.5 text-success" />
      </Show>
    </IconButton>
  )
}

export function EnvironmentInspector(props: EnvironmentInspectorProps) {
  const [regeneratingWebhook, setRegeneratingWebhook] = createSignal(false)
  const [regeneratingDebug, setRegeneratingDebug] = createSignal(false)
  const [confirmModalOpen, setConfirmModalOpen] = createSignal(false)
  const [confirmAction, setConfirmAction] = createSignal<"webhook" | "debug" | null>(null)
  const [debugVersion, setDebugVersion] = createSignal("preview")
  const [editedChannelId, setEditedChannelId] = createSignal(props.env.channelId)
  const [savingChannel, setSavingChannel] = createSignal(false)

  const generateSample = (schema: unknown) => {
    if (!schema || typeof schema !== "object") return "{}"
    const s = schema as Record<string, unknown>
    if (!s.properties || Object.keys(s.properties).length === 0) return "{}"
    const sample: Record<string, unknown> = {}
    const properties = s.properties as Record<string, Record<string, unknown>>
    for (const [key, prop] of Object.entries(properties)) {
      if (prop.type === "string") sample[key] = "example"
      else if (prop.type === "number" || prop.type === "integer") sample[key] = 0
      else if (prop.type === "boolean") sample[key] = true
      else if (prop.type === "array") sample[key] = []
      else if (prop.type === "object") sample[key] = {}
      else sample[key] = null
    }
    return JSON.stringify(sample)
  }

  const currentReleaseSchema = () => {
    const release = props.releases?.find((r) => r.id === props.currentReleaseId)
    return release?.payloadSchema ?? {}
  }

  const debugSchema = () => {
    const version = debugVersion()
    if (version === "preview") return props.payloadSchema
    if (version === "latest") return props.releases?.[0]?.payloadSchema ?? {}
    return props.releases?.find((r) => r.version === version)?.payloadSchema ?? {}
  }

  const webhookPayloadSample = () => generateSample(currentReleaseSchema())
  const debugPayloadSample = () => generateSample(debugSchema())

  const webhookUrl = () =>
    `${props.apiBaseUrl}/api/webhook/${props.orgSlug}/${props.env.environment.slug}/${props.triggerSlug}`

  const debugUrl = (version: string) => {
    const urlVersion = version === "preview" || version === "latest" ? version : `v${version}`
    return `${props.apiBaseUrl}/api/triggers/${props.orgSlug}/${props.env.environment.slug}/${props.triggerSlug}/${urlVersion}/run`
  }

  const handleSaveChannel = async () => {
    if (editedChannelId() === props.env.channelId) return
    setSavingChannel(true)
    try {
      await props.onUpdateChannel(editedChannelId())
    } finally {
      setSavingChannel(false)
    }
  }

  const handleResetChannel = () => {
    setEditedChannelId(props.env.channelId)
  }

  const channelDirty = () => editedChannelId() !== props.env.channelId

  createEffect(() => {
    setEditedChannelId(props.env.channelId)
  })

  const handleConfirmAction = async () => {
    const action = confirmAction()
    if (action === "webhook") {
      setRegeneratingWebhook(true)
      try {
        await props.onRegenerateWebhookSecret()
      } finally {
        setRegeneratingWebhook(false)
      }
    } else if (action === "debug") {
      setRegeneratingDebug(true)
      try {
        await props.onRegenerateDebugSecret()
      } finally {
        setRegeneratingDebug(false)
      }
    }
    setConfirmModalOpen(false)
    setConfirmAction(null)
  }

  const confirmModalTitle = () => {
    const action = confirmAction()
    if (action === "webhook") return "Regenerate webhook secret"
    if (action === "debug") return "Regenerate debug secret"
    return ""
  }

  const confirmModalMessage = () => {
    const action = confirmAction()
    if (action === "webhook") return "Are you sure? Existing integrations using the current secret will stop working."
    if (action === "debug") return "Are you sure? Existing debug scripts will need to be updated."
    return ""
  }

  return (
    <>
      <div class="space-y-0">
        <Show when={!props.env.active}>
          <div class="mx-3 mb-2 mt-3 flex items-start gap-2 rounded border border-warning/30 bg-warning/5 px-2.5 py-2">
            <Warning class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" weight="fill" />
            <div class="flex flex-col gap-0.5">
              <span class="text-2xs font-medium text-warning">Environment disabled</span>
              <span class="text-2xs leading-tight text-text-muted">
                This trigger will not execute in this environment until enabled.
              </span>
            </div>
          </div>
        </Show>

        <div class="mx-3 mb-2 mt-3 flex items-start gap-2 rounded border border-accent/30 bg-accent/5 px-2.5 py-2">
          <Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" weight="fill" />
          <span class="text-2xs leading-tight text-text-muted">
            Environment settings take effect immediately without deployment.
          </span>
        </div>

        <CollapsibleSection title={props.env.environment.name}>
          <div class="space-y-3">
            <FormField horizontal labelWidth="5rem" label="Channel">
              <Select
                value={editedChannelId()}
                options={props.availableChannels.map((c) => ({ value: c.id, label: c.name }))}
                onChange={setEditedChannelId}
                class="h-7 text-xs"
              />
            </FormField>
            <Show when={channelDirty()}>
              <div class="flex items-center justify-end gap-2">
                <Button variant="outline" size="xs" onClick={handleResetChannel} disabled={savingChannel()}>
                  Cancel
                </Button>
                <Button variant="default" size="xs" onClick={handleSaveChannel} disabled={savingChannel()}>
                  <Show when={savingChannel()}>
                    <Spinner size="xs" class="border-white border-t-transparent" />
                  </Show>
                  Save changes
                </Button>
              </div>
            </Show>
          </div>
        </CollapsibleSection>

        <Show when={props.triggerType === "webhook"}>
          <CollapsibleSection title="Webhook">
            <div class="space-y-2">
              <div class="flex items-center gap-1">
                <span class="w-14 shrink-0 text-2xs text-text-muted">URL</span>
                <Input type="text" value={webhookUrl()} readOnly class="h-6 flex-1 font-code text-xs" />
                <CopyButton value={webhookUrl()} />
              </div>
              <div class="flex items-center gap-1">
                <span class="w-14 shrink-0 text-2xs text-text-muted">Secret</span>
                <Input
                  type="password"
                  value={props.env.webhookSecret ?? ""}
                  readOnly
                  class="h-6 flex-1 font-code text-xs"
                />
                <CopyButton value={props.env.webhookSecret ?? ""} />
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmAction("webhook")
                    setConfirmModalOpen(true)
                  }}
                  title="Regenerate secret"
                  disabled={regeneratingWebhook()}
                >
                  <ArrowsClockwise class="h-3.5 w-3.5" />
                </IconButton>
              </div>
              <div class="flex items-start gap-1">
                <pre class="flex-1 overflow-x-auto rounded-md bg-surface-muted p-2 font-code text-2xs text-text-muted">
                  {`curl -X POST ${webhookUrl()} \\
  -H "Authorization: Bearer ${props.env.webhookSecret ?? "<secret>"}" \\
  -H "Content-Type: application/json" \\
  -d '${webhookPayloadSample()}'`}
                </pre>
                <CopyButton
                  value={`curl -X POST ${webhookUrl()} -H "Authorization: Bearer ${props.env.webhookSecret ?? "<secret>"}" -H "Content-Type: application/json" -d '${webhookPayloadSample()}'`}
                />
              </div>
            </div>
          </CollapsibleSection>
        </Show>

        <CollapsibleSection title="Debug">
          <div class="space-y-2">
            <div class="flex items-center gap-1">
              <span class="w-14 shrink-0 text-2xs text-text-muted">Version</span>
              <Select
                value={debugVersion()}
                options={[
                  { value: "preview", label: "Working copy" },
                  { value: "latest", label: "Latest release" },
                  ...(props.releases ?? []).map((r) => ({ value: r.version, label: `v${r.version}` })),
                ]}
                onChange={setDebugVersion}
                class="h-6 flex-1 text-xs"
              />
            </div>
            <div class="flex items-center gap-1">
              <span class="w-14 shrink-0 text-2xs text-text-muted">URL</span>
              <Input type="text" value={debugUrl(debugVersion())} readOnly class="h-6 flex-1 font-code text-xs" />
              <CopyButton value={debugUrl(debugVersion())} />
            </div>
            <div class="flex items-center gap-1">
              <span class="w-14 shrink-0 text-2xs text-text-muted">Secret</span>
              <Input
                type="password"
                value={props.env.debugSecret ?? ""}
                readOnly
                class="h-6 flex-1 font-code text-xs"
              />
              <CopyButton value={props.env.debugSecret ?? ""} />
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmAction("debug")
                  setConfirmModalOpen(true)
                }}
                title="Regenerate secret"
                disabled={regeneratingDebug()}
              >
                <ArrowsClockwise class="h-3.5 w-3.5" />
              </IconButton>
            </div>
            <div class="flex items-start gap-1">
              <pre class="flex-1 overflow-x-auto rounded-md bg-surface-muted p-2 font-code text-2xs text-text-muted">
                {`curl -X POST ${debugUrl(debugVersion())} \\
  -H "Authorization: Bearer ${props.env.debugSecret ?? "<secret>"}" \\
  -H "Content-Type: application/json" \\
  -d '${debugPayloadSample()}'`}
              </pre>
              <CopyButton
                value={`curl -X POST ${debugUrl(debugVersion())} -H "Authorization: Bearer ${props.env.debugSecret ?? "<secret>"}" -H "Content-Type: application/json" -d '${debugPayloadSample()}'`}
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <Modal
        open={confirmModalOpen()}
        onBackdropClick={() => setConfirmModalOpen(false)}
        onEscape={() => setConfirmModalOpen(false)}
      >
        <ModalContainer size="sm">
          <div class="border-b border-border px-4 py-3">
            <h3 class="text-xs font-medium text-text">{confirmModalTitle()}</h3>
          </div>
          <div class="p-4">
            <p class="text-xs text-text-muted">{confirmModalMessage()}</p>
          </div>
          <ModalFooter>
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirmAction}
                disabled={regeneratingWebhook() || regeneratingDebug()}
              >
                <Show when={regeneratingWebhook() || regeneratingDebug()}>
                  <Spinner size="xs" class="border-white border-t-transparent" />
                </Show>
                Regenerate
              </Button>
            </>
          </ModalFooter>
        </ModalContainer>
      </Modal>
    </>
  )
}
