import { Show } from "solid-js"
import { Modal, ModalContainer, ModalFooter, Button, Spinner } from "../../ui"

type TriggerDeleteModalProps = {
  open: boolean
  triggerName: string
  onClose: () => void
  onConfirm: () => Promise<void>
  deleting?: boolean
}

export function TriggerDeleteModal(props: TriggerDeleteModalProps) {
  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <div class="border-b border-border px-4 py-3">
          <h3 class="text-xs font-medium text-text">Delete trigger</h3>
        </div>
        <div class="flex flex-col gap-1 p-4">
          <p class="text-xs text-text-muted">
            Are you sure you want to delete <span class="font-medium text-text">{props.triggerName}</span>?
          </p>
          <p class="text-2xs text-text-muted">This action cannot be undone.</p>
        </div>
        <ModalFooter>
          <>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={props.onConfirm} disabled={props.deleting}>
              <Show when={props.deleting}>
                <Spinner size="xs" class="border-white border-t-transparent" />
              </Show>
              {props.deleting ? "Deleting..." : "Delete"}
            </Button>
          </>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
