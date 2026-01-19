import { Show } from "solid-js"
import { Modal, ModalContainer, ModalFooter, Button, Spinner } from "../../ui"

type CancelSubscriptionModalProps = {
  open: boolean
  cancelDate: string
  onClose: () => void
  onConfirm: () => Promise<void>
  cancelling?: boolean
}

export function CancelSubscriptionModal(props: CancelSubscriptionModalProps) {
  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <div class="border-b border-border px-3 py-2">
          <h3 class="text-xs font-medium text-text">Cancel subscription</h3>
        </div>
        <div class="flex flex-col gap-2 p-3">
          <p class="text-xs text-text-muted">Are you sure you want to cancel your subscription?</p>
          <p class="text-2xs text-text-muted">
            Your subscription will remain active until <span class="font-medium text-text">{props.cancelDate}</span>.
            After that, you'll be downgraded to the Free plan.
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.cancelling}>
            Keep subscription
          </Button>
          <Button variant="destructive" size="sm" onClick={props.onConfirm} disabled={props.cancelling}>
            <Show when={props.cancelling}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
            {props.cancelling ? "Cancelling..." : "Cancel subscription"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
