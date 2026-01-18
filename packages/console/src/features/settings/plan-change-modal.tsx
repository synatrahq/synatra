import { Show } from "solid-js"
import { Modal, ModalContainer, ModalFooter, Button, Spinner } from "../../ui"
import { PLAN_LIMITS, type SubscriptionPlan } from "@synatra/core/types"

function formatRunLimit(plan: SubscriptionPlan): string {
  const limit = PLAN_LIMITS[plan].runLimit
  return limit !== null ? `${limit.toLocaleString()}/month` : "Unlimited"
}

type PlanChangeModalProps = {
  open: boolean
  currentPlan: SubscriptionPlan
  targetPlan: SubscriptionPlan
  isUpgrade: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  changing?: boolean
}

export function PlanChangeModal(props: PlanChangeModalProps) {
  const action = props.isUpgrade ? "upgrade" : "downgrade"
  const description = props.isUpgrade
    ? "Your plan will be upgraded immediately. You'll be charged a prorated amount for the remainder of this billing period."
    : "Your plan change will be scheduled to take effect at the end of your current billing period. You'll continue to have access to your current plan features until then."

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <div class="border-b border-border px-3 py-2">
          <h3 class="text-xs font-medium text-text">{props.isUpgrade ? "Upgrade plan" : "Downgrade plan"}</h3>
        </div>
        <div class="flex flex-col gap-3 p-3">
          <div class="flex items-center gap-2 text-xs">
            <span class="capitalize text-text">{props.currentPlan}</span>
            <span class="text-text-muted">→</span>
            <span class="font-medium capitalize text-text">{props.targetPlan}</span>
          </div>
          <p class="text-2xs text-text-muted">{description}</p>
          <div class="flex flex-col gap-1.5 rounded border border-border bg-surface-elevated p-2">
            <div class="flex items-center justify-between text-2xs">
              <span class="text-text-muted">Current run limit</span>
              <span class="text-text">{formatRunLimit(props.currentPlan)}</span>
            </div>
            <div class="flex items-center justify-between text-2xs">
              <span class="text-text-muted">New run limit</span>
              <span class="font-medium text-text">{formatRunLimit(props.targetPlan)}</span>
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.changing}>
            Cancel
          </Button>
          <Button
            variant={props.isUpgrade ? "default" : "secondary"}
            size="sm"
            onClick={props.onConfirm}
            disabled={props.changing}
          >
            <Show when={props.changing}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
            {props.changing ? "Processing..." : `Confirm ${action}`}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
