import { createSignal, createEffect } from "solid-js"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Input, Spinner, FormField } from "../../ui"

type ChannelCreateModalProps = {
  open: boolean
  onClose: () => void
  onSave: (data: { name: string; slug?: string }) => Promise<void>
  saving?: boolean
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function ChannelCreateModal(props: ChannelCreateModalProps) {
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [slugManuallyEdited, setSlugManuallyEdited] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  createEffect(() => {
    if (props.open) {
      setName("")
      setSlug("")
      setSlugManuallyEdited(false)
      setError(null)
    }
  })

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugManuallyEdited()) {
      setSlug(generateSlug(value))
    }
  }

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true)
    setSlug(value)
  }

  const handleSave = async () => {
    if (!name().trim()) {
      setError("Name is required")
      return
    }

    try {
      await props.onSave({
        name: name().trim(),
        slug: slug().trim() || undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create channel")
    }
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader title="Create channel" onClose={props.onClose} />
        <ModalBody>
          <div class="space-y-3">
            <FormField label="Name" for="channel-name">
              <Input
                id="channel-name"
                type="text"
                value={name()}
                onInput={(e) => handleNameChange(e.currentTarget.value)}
                placeholder="Support"
                class="h-8 text-xs"
                autofocus
              />
            </FormField>
            <FormField label="Slug (optional)" for="channel-slug">
              <Input
                id="channel-slug"
                type="text"
                value={slug()}
                onInput={(e) => handleSlugChange(e.currentTarget.value)}
                placeholder="support"
                class="h-8 font-code text-xs"
              />
            </FormField>
          </div>
          {error() && (
            <div class="mt-3 rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
              {error()}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={props.saving || !name().trim()}>
            {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
            {props.saving ? "Creating..." : "Create"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
