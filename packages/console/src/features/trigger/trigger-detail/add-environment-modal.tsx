import { createSignal, createEffect, createMemo, Show } from "solid-js"
import { Warning } from "phosphor-solid-js"
import {
  Button,
  Spinner,
  Modal,
  ModalContainer,
  ModalBody,
  ModalFooter,
  Select,
  FormField,
  Checkbox,
} from "../../../ui"

type EnvironmentOption = {
  id: string
  name: string
  slug: string
  color: string | null
}

type ChannelOption = {
  id: string
  name: string
  slug: string
}

type AddEnvironmentModalProps = {
  open: boolean
  environments: EnvironmentOption[]
  channels: ChannelOption[]
  existingEnvironmentIds: string[]
  agentName: string
  agentChannelIds: string[]
  onClose: () => void
  onAdd: (environmentId: string, channelId: string, addAgentToChannel: boolean) => Promise<void>
}

export function AddEnvironmentModal(props: AddEnvironmentModalProps) {
  const [environmentId, setEnvironmentId] = createSignal("")
  const [channelId, setChannelId] = createSignal("")
  const [addAgentToChannel, setAddAgentToChannel] = createSignal(false)
  const [saving, setSaving] = createSignal(false)

  const availableEnvironments = () => props.environments.filter((e) => !props.existingEnvironmentIds.includes(e.id))

  const selectedChannel = createMemo(() => props.channels.find((c) => c.id === channelId()))

  const isAgentInChannel = createMemo(() => {
    const chId = channelId()
    if (!chId) return true
    return props.agentChannelIds.includes(chId)
  })

  createEffect(() => {
    if (props.open) {
      setEnvironmentId("")
      setChannelId("")
      setAddAgentToChannel(false)
    }
  })

  const handleAdd = async () => {
    const envId = environmentId()
    const chId = channelId()
    if (!envId || !chId) return

    setSaving(true)
    try {
      await props.onAdd(envId, chId, !isAgentInChannel() && addAgentToChannel())
      props.onClose()
    } finally {
      setSaving(false)
    }
  }

  const canSave = () => {
    if (!environmentId() || !channelId()) return false
    if (!isAgentInChannel() && !addAgentToChannel()) return false
    return true
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <div class="border-b border-border px-4 py-3">
          <h3 class="text-xs font-medium text-text">Add environment</h3>
        </div>
        <ModalBody>
          <div class="space-y-3">
            <FormField label="Environment" required>
              <Select
                value={environmentId()}
                options={availableEnvironments().map((e) => ({
                  value: e.id,
                  label: e.name,
                }))}
                onChange={setEnvironmentId}
                placeholder="Select environment"
                class="h-8 text-xs"
              />
            </FormField>
            <FormField label="Channel" required>
              <Select
                value={channelId()}
                options={props.channels.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                onChange={(value) => {
                  setChannelId(value)
                  setAddAgentToChannel(false)
                }}
                placeholder="Select channel"
                class="h-8 text-xs"
              />
            </FormField>
            <Show when={channelId() && !isAgentInChannel()}>
              <div class="rounded-md border border-warning bg-warning-soft px-3 py-2">
                <div class="flex items-start gap-2">
                  <Warning class="mt-0.5 h-4 w-4 shrink-0 text-warning" weight="fill" />
                  <div class="flex-1 space-y-2">
                    <p class="text-xs text-warning">
                      Agent "{props.agentName}" is not added to channel #{selectedChannel()?.name}
                    </p>
                    <label class="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={addAgentToChannel()}
                        onChange={(e) => setAddAgentToChannel(e.currentTarget.checked)}
                      />
                      <span class="text-xs text-text">Add agent to this channel</span>
                    </label>
                  </div>
                </div>
              </div>
            </Show>
            <Show when={availableEnvironments().length === 0}>
              <p class="text-xs text-text-muted">All environments are already configured for this trigger.</p>
            </Show>
          </div>
        </ModalBody>
        <ModalFooter>
          <>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleAdd} disabled={saving() || !canSave()}>
              <Show when={saving()}>
                <Spinner size="xs" class="border-white border-t-transparent" />
              </Show>
              {saving() ? "Adding..." : "Add"}
            </Button>
          </>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
