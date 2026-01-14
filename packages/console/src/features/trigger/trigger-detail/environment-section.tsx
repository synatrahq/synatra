import { For, Show, createEffect, createSignal } from "solid-js"
import { Copy, Check, ArrowsClockwise, CaretDown, CaretRight, Plus, Hash, DotsThree } from "phosphor-solid-js"
import {
  FormField,
  Input,
  IconButton,
  Button,
  Spinner,
  Modal,
  ModalContainer,
  ModalFooter,
  CollapsibleSection,
  Switch,
  DropdownMenu,
  Select,
} from "../../../ui"
import type { DropdownMenuItem } from "../../../ui"

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

type EnvironmentSectionProps = {
  triggerId: string
  triggerSlug: string
  triggerType: "webhook" | "schedule" | "app"
  orgSlug: string
  apiBaseUrl: string
  environments: TriggerEnvironmentInfo[]
  availableChannels: ChannelInfo[]
  releases?: ReleaseInfo[]
  currentReleaseId?: string | null
  payloadSchema?: unknown
  onToggle: (environmentId: string) => Promise<void>
  onRegenerateWebhookSecret: (environmentId: string) => Promise<void>
  onRegenerateDebugSecret: (environmentId: string) => Promise<void>
  onUpdateChannel: (environmentId: string, channelId: string) => Promise<void>
  onRemove: (environmentId: string) => Promise<void>
  onAdd: () => void
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

function EnvironmentItem(props: {
  env: TriggerEnvironmentInfo
  triggerSlug: string
  triggerType: "webhook" | "schedule" | "app"
  orgSlug: string
  apiBaseUrl: string
  availableChannels: ChannelInfo[]
  releases?: ReleaseInfo[]
  currentReleaseId?: string | null
  payloadSchema?: unknown
  onToggle: () => Promise<void>
  onRegenerateWebhookSecret: () => Promise<void>
  onRegenerateDebugSecret: () => Promise<void>
  onUpdateChannel: (channelId: string) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [expanded, setExpanded] = createSignal(false)
  const [toggling, setToggling] = createSignal(false)
  const [regeneratingWebhook, setRegeneratingWebhook] = createSignal(false)
  const [regeneratingDebug, setRegeneratingDebug] = createSignal(false)
  const [confirmModalOpen, setConfirmModalOpen] = createSignal(false)
  const [confirmAction, setConfirmAction] = createSignal<"webhook" | "debug" | "remove" | null>(null)
  const [removing, setRemoving] = createSignal(false)
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

  const handleToggle = async () => {
    setToggling(true)
    try {
      await props.onToggle()
    } finally {
      setToggling(false)
    }
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
    } else if (action === "remove") {
      setRemoving(true)
      try {
        await props.onRemove()
      } finally {
        setRemoving(false)
      }
    }
    setConfirmModalOpen(false)
    setConfirmAction(null)
  }

  const confirmModalTitle = () => {
    const action = confirmAction()
    if (action === "webhook") return "Regenerate webhook secret"
    if (action === "debug") return "Regenerate debug secret"
    if (action === "remove") return "Remove environment"
    return ""
  }

  const confirmModalMessage = () => {
    const action = confirmAction()
    if (action === "webhook") return "Are you sure? Existing integrations using the current secret will stop working."
    if (action === "debug") return "Are you sure? Existing debug scripts will need to be updated."
    if (action === "remove") return "Are you sure? This environment configuration will be permanently deleted."
    return ""
  }

  const menuItems: DropdownMenuItem[] = [
    {
      type: "item",
      label: "Remove",
      variant: "danger",
      onClick: () => {
        setConfirmAction("remove")
        setConfirmModalOpen(true)
      },
    },
  ]

  return (
    <>
      <div class="rounded border border-border bg-surface">
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-surface-muted/50"
          onClick={() => setExpanded(!expanded())}
        >
          <div class="flex items-center gap-2">
            <Show when={expanded()} fallback={<CaretRight class="h-3 w-3 text-text-muted" />}>
              <CaretDown class="h-3 w-3 text-text-muted" />
            </Show>
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              style={{ background: props.env.environment.color || "#6366F1" }}
            />
            <span class="text-xs font-medium text-text">{props.env.environment.name}</span>
            <span class="flex items-center gap-0.5 text-2xs text-text-muted">
              <Hash class="h-2.5 w-2.5" />
              {props.env.channel.name}
            </span>
          </div>
          <div class="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Show when={props.env.active}>
              <span class="rounded bg-success/10 px-1.5 py-0.5 text-2xs font-medium text-success">Active</span>
            </Show>
            <Switch checked={props.env.active} onClick={handleToggle} disabled={toggling()} class="scale-75" />
            <DropdownMenu
              items={menuItems}
              trigger={
                <IconButton variant="ghost" size="sm">
                  <DotsThree class="h-3.5 w-3.5" weight="bold" />
                </IconButton>
              }
            />
          </div>
        </button>

        <Show when={expanded()}>
          <div class="space-y-3 border-t border-border px-3 py-3">
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

            <Show when={props.triggerType === "webhook"}>
              <div class="border-t border-border pt-3">
                <div class="mb-2 text-xs font-medium text-text-muted">Webhook</div>
                <div class="flex items-center gap-1">
                  <span class="w-14 shrink-0 text-2xs text-text-muted">URL</span>
                  <Input type="text" value={webhookUrl()} readOnly class="h-6 flex-1 font-code text-xs" />
                  <CopyButton value={webhookUrl()} />
                </div>
                <div class="mt-2 flex items-center gap-1">
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
                <div class="mt-2 flex items-start gap-1">
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
            </Show>

            <div class="border-t border-border pt-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs font-medium text-text-muted">Debug</span>
                <Select
                  value={debugVersion()}
                  options={[
                    { value: "preview", label: "Working copy" },
                    { value: "latest", label: "Latest release" },
                    ...(props.releases ?? []).map((r) => ({ value: r.version, label: `v${r.version}` })),
                  ]}
                  onChange={setDebugVersion}
                  wrapperClass="relative flex w-36 shrink-0"
                  class="h-6 px-2 text-xs"
                />
              </div>
              <div class="flex items-center gap-1">
                <span class="w-14 shrink-0 text-2xs text-text-muted">URL</span>
                <Input type="text" value={debugUrl(debugVersion())} readOnly class="h-6 flex-1 font-code text-xs" />
                <CopyButton value={debugUrl(debugVersion())} />
              </div>
              <div class="mt-2 flex items-center gap-1">
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
              <div class="mt-2 flex items-start gap-1">
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
          </div>
        </Show>
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
                variant={confirmAction() === "remove" ? "destructive" : "default"}
                size="sm"
                onClick={handleConfirmAction}
                disabled={regeneratingWebhook() || regeneratingDebug() || removing()}
              >
                <Show when={regeneratingWebhook() || regeneratingDebug() || removing()}>
                  <Spinner size="xs" class="border-white border-t-transparent" />
                </Show>
                {confirmAction() === "remove" ? "Remove" : "Regenerate"}
              </Button>
            </>
          </ModalFooter>
        </ModalContainer>
      </Modal>
    </>
  )
}

export function EnvironmentSection(props: EnvironmentSectionProps) {
  return (
    <CollapsibleSection
      title="Environments"
      actions={
        <Button variant="ghost" size="xs" onClick={props.onAdd} class="h-5 w-5 p-0">
          <Plus class="h-3 w-3" />
        </Button>
      }
    >
      <div class="space-y-2">
        <Show when={props.environments.length === 0}>
          <div class="flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border py-6">
            <p class="text-xs text-text-muted">No environments configured</p>
            <Button variant="outline" size="sm" onClick={props.onAdd}>
              <Plus class="h-3 w-3" />
              Add environment
            </Button>
          </div>
        </Show>
        <For each={props.environments}>
          {(env) => (
            <EnvironmentItem
              env={env}
              triggerSlug={props.triggerSlug}
              triggerType={props.triggerType}
              orgSlug={props.orgSlug}
              apiBaseUrl={props.apiBaseUrl}
              availableChannels={props.availableChannels}
              releases={props.releases}
              currentReleaseId={props.currentReleaseId}
              payloadSchema={props.payloadSchema}
              onToggle={() => props.onToggle(env.environmentId)}
              onRegenerateWebhookSecret={() => props.onRegenerateWebhookSecret(env.environmentId)}
              onRegenerateDebugSecret={() => props.onRegenerateDebugSecret(env.environmentId)}
              onUpdateChannel={(channelId) => props.onUpdateChannel(env.environmentId, channelId)}
              onRemove={() => props.onRemove(env.environmentId)}
            />
          )}
        </For>
      </div>
    </CollapsibleSection>
  )
}
