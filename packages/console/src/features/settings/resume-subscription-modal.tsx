import { Show } from "solid-js"
import { Modal, ModalContainer, ModalFooter, Button, Spinner } from "../../ui"

type ResumeSubscriptionModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  resuming?: boolean
}

export function ResumeSubscriptionModal(props: ResumeSubscriptionModalProps) {
  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <div class="border-b border-border px-3 py-2">
          <h3 class="text-xs font-medium text-text">Resume subscription</h3>
        </div>
        <div class="flex flex-col gap-2 p-3">
          <p class="text-xs text-text-muted">Are you sure you want to resume your subscription?</p>
          <p class="text-2xs text-text-muted">
            Your subscription will continue and you won't be downgraded to the Free plan.
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.resuming}>
            Keep cancellation
          </Button>
          <Button variant="default" size="sm" onClick={props.onConfirm} disabled={props.resuming}>
            <Show when={props.resuming}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
            {props.resuming ? "Resuming..." : "Resume subscription"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
