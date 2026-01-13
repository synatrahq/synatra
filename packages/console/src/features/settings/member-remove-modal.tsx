import { Show } from "solid-js"
import { Modal, ModalContainer, ModalFooter, Button, Spinner } from "../../ui"

type MemberRemoveModalProps = {
  open: boolean
  type: "member" | "invitation"
  identifier: string
  onClose: () => void
  onConfirm: () => Promise<void>
  removing?: boolean
}

export function MemberRemoveModal(props: MemberRemoveModalProps) {
  const title = () => (props.type === "member" ? "Remove member" : "Cancel invitation")
  const action = () => (props.type === "member" ? "remove" : "cancel the invitation for")
  const button = () => (props.type === "member" ? "Remove" : "Cancel invitation")

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <div class="border-b border-border px-4 py-3">
          <h3 class="text-xs font-medium text-text">{title()}</h3>
        </div>
        <div class="flex flex-col gap-1 p-4">
          <p class="text-xs text-text-muted">
            Are you sure you want to {action()} <span class="font-medium text-text">{props.identifier}</span>?
          </p>
          <Show when={props.type === "member"}>
            <p class="text-2xs text-text-muted">They will lose access to this organization.</p>
          </Show>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.removing}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={props.onConfirm} disabled={props.removing}>
            <Show when={props.removing}>
              <Spinner size="xs" class="border-white border-t-transparent" />
            </Show>
            {props.removing ? (props.type === "member" ? "Removing..." : "Canceling...") : button()}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
