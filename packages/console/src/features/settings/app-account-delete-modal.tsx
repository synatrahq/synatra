import { Show } from "solid-js"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Spinner } from "../../ui"

type AppAccountDeleteModalProps = {
  open: boolean
  accountName: string
  onClose: () => void
  onConfirm: () => void
  deleting?: boolean
}

export function AppAccountDeleteModal(props: AppAccountDeleteModalProps) {
  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader title="Delete connection" onClose={props.onClose} />
        <ModalBody>
          <p class="text-xs text-text">
            Are you sure you want to delete <span class="font-medium">{props.accountName}</span>?
          </p>
          <p class="mt-1 text-2xs text-text-muted">This will disable all triggers using this connection.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.deleting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={props.onConfirm} disabled={props.deleting}>
            {props.deleting && <Spinner size="xs" class="border-white border-t-transparent" />}
            {props.deleting ? "Deleting..." : "Delete"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
