import { createSignal, createEffect, Show } from "solid-js"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  FormField,
  Spinner,
  FormError,
} from "../../ui"

type ConnectorCreateModalProps = {
  open: boolean
  onClose: () => void
  onSave: (data: { name: string }) => Promise<void>
  saving?: boolean
}

export function ConnectorCreateModal(props: ConnectorCreateModalProps) {
  const [name, setName] = createSignal("")
  const [error, setError] = createSignal("")

  createEffect(() => {
    if (props.open) {
      setName("")
      setError("")
    }
  })

  const handleSave = async () => {
    const trimmedName = name().trim()
    if (!trimmedName) {
      setError("Name is required")
      return
    }
    try {
      await props.onSave({ name: trimmedName })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create connector")
    }
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader title="New connector" onClose={props.onClose} />
        <ModalBody>
          <FormField label="Name" horizontal labelWidth="4.5rem">
            <Input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="My VPC Connector" />
          </FormField>
          <FormError message={error()} />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={props.saving || !name().trim()}>
            {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
            {props.saving ? "Creating..." : "Create"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
