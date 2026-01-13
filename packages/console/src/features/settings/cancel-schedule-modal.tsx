import { Show } from "solid-js"
import { Modal, ModalContainer, ModalFooter, Button, Spinner } from "../../ui"
import type { SubscriptionPlan } from "@synatra/core/types"

type CancelScheduleModalProps = {
  open: boolean
  currentPlan: SubscriptionPlan
  scheduledPlan: SubscriptionPlan
  scheduledDate: string
  onClose: () => void
  onConfirm: () => Promise<void>
  cancelling?: boolean
}

export function CancelScheduleModal(props: CancelScheduleModalProps) {
  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <div class="border-b border-border px-3 py-2">
          <h3 class="text-xs font-medium text-text">Cancel scheduled plan change</h3>
        </div>
        <div class="flex flex-col gap-2 p-3">
          <p class="text-xs text-text-muted">
            Cancel scheduled change to <span class="font-medium capitalize text-text">{props.scheduledPlan}</span> on{" "}
            <span class="font-medium text-text">{props.scheduledDate}</span>?
          </p>
          <p class="text-2xs text-text-muted">
            You'll remain on your current <span class="capitalize">{props.currentPlan}</span> plan.
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.cancelling}>
            Keep schedule
          </Button>
          <Button variant="default" size="sm" onClick={props.onConfirm} disabled={props.cancelling}>
            <Show when={props.cancelling}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
            {props.cancelling ? "Cancelling..." : "Cancel schedule"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
