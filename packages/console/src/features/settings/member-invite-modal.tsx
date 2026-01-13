import { createSignal, createEffect, Show, createMemo } from "solid-js"
import type { Role } from "@synatra/core/permissions"
import { MemberRole, type SubscriptionPlan } from "@synatra/core/types"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Select,
  FormField,
  Spinner,
} from "../../ui"
import type { SelectOption } from "../../ui"
import { checkUserLimit } from "../../utils/subscription-limits"
import { capitalize } from "../../utils/string"

type MemberInviteModalProps = {
  open: boolean
  onClose: () => void
  onInvite: (emails: string[], role: Role) => Promise<void>
  inviting?: boolean
  currentUserCount: number
  plan: SubscriptionPlan | null
}

const roleOptions: SelectOption<Role>[] = MemberRole.map((r) => ({
  value: r,
  label: capitalize(r),
}))

function parseEmails(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0)
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function MemberInviteModal(props: MemberInviteModalProps) {
  const [emails, setEmails] = createSignal("")
  const [role, setRole] = createSignal<Role>("member")
  const [error, setError] = createSignal("")

  createEffect(() => {
    if (props.open) {
      setEmails("")
      setRole("member")
      setError("")
    }
  })

  const handleInvite = async () => {
    const parsed = parseEmails(emails())
    if (parsed.length === 0) {
      setError("Please enter at least one email address")
      return
    }

    const invalid = parsed.filter((e) => !isValidEmail(e))
    if (invalid.length > 0) {
      setError(`Invalid email${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`)
      return
    }

    setError("")
    await props.onInvite(parsed, role())
  }

  const validCount = () => {
    const parsed = parseEmails(emails())
    return parsed.filter(isValidEmail).length
  }

  const limitCheck = createMemo(() => {
    if (!props.plan) return null
    return checkUserLimit(props.currentUserCount, validCount(), props.plan)
  })

  const limitError = createMemo(() => {
    const check = limitCheck()
    if (!check || check.allowed) return null
    return check.message
  })

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader title="Invite users" onClose={props.onClose} />
        <ModalBody>
          <FormField label="Email addresses" description="Enter multiple emails separated by commas or new lines">
            <Textarea
              value={emails()}
              onInput={(e) => setEmails(e.currentTarget.value)}
              placeholder="user1@example.com, user2@example.com"
              rows={4}
            />
            <Show when={validCount() > 0}>
              <p class="mt-1 text-2xs text-text-muted">
                {validCount()} valid email{validCount() !== 1 ? "s" : ""}
              </p>
            </Show>
          </FormField>

          <FormField label="Role" horizontal labelWidth="4.5rem">
            <Select value={role()} options={roleOptions} onChange={setRole} placeholder="Select role" />
          </FormField>

          <Show when={error()}>
            <div class="rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-2xs text-danger">
              {error()}
            </div>
          </Show>

          <Show when={limitError()}>
            <div class="rounded-md border border-warning bg-warning/5 px-2.5 py-1.5 text-2xs text-warning">
              {limitError()}
            </div>
          </Show>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.inviting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleInvite} disabled={props.inviting || validCount() === 0 || !!limitError()}>
            {props.inviting && <Spinner size="xs" class="border-white border-t-transparent" />}
            {props.inviting ? "Inviting..." : `Invite ${validCount() > 0 ? validCount() : ""}`}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
