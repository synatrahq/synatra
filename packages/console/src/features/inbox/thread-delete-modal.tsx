import { Show } from "solid-js"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Spinner } from "../../ui"

type ThreadDeleteModalProps = {
  open: boolean
  threadSubject: string
  onClose: () => void
  onConfirm: () => Promise<void>
  deleting?: boolean
}

export function ThreadDeleteModal(props: ThreadDeleteModalProps) {
  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader title="Delete thread" onClose={props.onClose} />
        <ModalBody>
          <div class="flex flex-col gap-1">
            <p class="text-xs text-text-muted">
              Are you sure you want to delete <span class="font-medium text-text">{props.threadSubject}</span>?
            </p>
            <p class="text-2xs text-text-muted">This action cannot be undone.</p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={props.onConfirm} disabled={props.deleting}>
            <Show when={props.deleting}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
            {props.deleting ? "Deleting..." : "Delete"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
