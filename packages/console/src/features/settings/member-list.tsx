import { For, Show, createSignal, createMemo } from "solid-js"
import type { Role } from "@synatra/core/permissions"
import { MemberRole, type SubscriptionPlan } from "@synatra/core/types"
import { Button, Badge, Avatar, Select, IconButton, DropdownMenu, Skeleton } from "../../ui"
import { SettingsHeader } from "./settings-header"
import type { SelectOption, DropdownMenuItem } from "../../ui"
import { Plus, DotsThree, Users, EnvelopeSimple, Warning } from "phosphor-solid-js"
import { can, user } from "../../app"
import { LimitBadge } from "../../components"
import { checkUserLimit } from "../../utils/subscription-limits"
import { useSubscription } from "../../utils/subscription"
import { capitalize } from "../../utils/string"

export type Member = {
  id: string
  userId: string
  role: Role
  user: { id: string; name: string | null; email: string; image: string | null }
  createdAt: string
}

export type Invitation = {
  id: string
  email: string
  role: Role
  status: "pending" | "accepted" | "rejected" | "canceled"
  expiresAt: string
  createdAt: string
}

type MemberListProps = {
  members: Member[]
  invitations: Invitation[]
  loading?: boolean
  onInviteClick: () => void
  onRoleChange: (memberId: string, role: Role) => void
  onRemoveMember: (member: Member) => void
  onRemoveInvitation: (invitation: Invitation) => void
  onResendInvitation: (invitation: Invitation) => void
}

const gridCols = "grid-cols-[minmax(120px,1.5fr)_1fr_1fr_1fr_40px]"

function ListSkeleton() {
  return (
    <div class="flex flex-col">
      <For each={[1, 2, 3]}>
        {() => (
          <div class={`grid items-center px-3 py-2 ${gridCols}`}>
            <div class="flex items-center gap-2">
              <Skeleton class="h-6 w-6 shrink-0 rounded-md" />
              <Skeleton class="h-3 w-20" />
            </div>
            <Skeleton class="h-3 w-32" />
            <Skeleton class="h-3 w-12" />
            <Skeleton class="h-3 w-10" />
            <div />
          </div>
        )}
      </For>
    </div>
  )
}

function EmptyState(props: { onInviteClick: () => void; canInvite: boolean }) {
  return (
    <div class="flex h-48 flex-col items-center justify-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted">
        <Users class="h-4 w-4 text-text-muted" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-xs font-medium text-text">No users yet</p>
        <p class="mt-0.5 text-2xs text-text-muted">Invite users to collaborate</p>
      </div>
      <Show when={can("invitation", "create")}>
        <Button variant="default" size="sm" onClick={() => props.onInviteClick()} disabled={!props.canInvite}>
          <Plus class="h-3 w-3" />
          Invite
        </Button>
      </Show>
    </div>
  )
}

export function MemberList(props: MemberListProps) {
  const subscriptionQuery = useSubscription()

  const totalUserCount = createMemo(
    () => props.members.length + props.invitations.filter((inv) => inv.status === "pending").length,
  )

  const limitCheck = createMemo(() => {
    if (!subscriptionQuery.data) return null
    return checkUserLimit(totalUserCount(), 1, subscriptionQuery.data.plan as SubscriptionPlan)
  })

  const canInvite = createMemo(() => limitCheck()?.allowed ?? true)

  const isOverLimit = createMemo(() => {
    const check = limitCheck()
    return !!check && check.limit !== null && check.current > check.limit
  })

  const [updatingRole, setUpdatingRole] = createSignal<string | null>(null)
  const currentUser = () => user()
  const canManage = () => can("invitation", "create")
  const currentUserRole = () => {
    const u = currentUser()
    if (!u) return null
    return props.members.find((m) => m.userId === u.id)?.role ?? null
  }
  const roleOptions = (): SelectOption<Role>[] => {
    const roles = currentUserRole() === "owner" ? MemberRole : MemberRole.filter((r) => r !== "owner")
    return roles.map((r) => ({ value: r, label: capitalize(r) }))
  }

  const handleRoleChange = async (memberId: string, role: Role) => {
    setUpdatingRole(memberId)
    await props.onRoleChange(memberId, role)
    setUpdatingRole(null)
  }

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <SettingsHeader
        title="Users"
        titleExtra={
          <Show when={limitCheck()}>
            <LimitBadge current={limitCheck()!.current} limit={limitCheck()!.limit} label="users" />
          </Show>
        }
      >
        <Show when={canManage()}>
          <Button variant="default" size="sm" onClick={() => props.onInviteClick()} disabled={!canInvite()}>
            <Plus class="h-3 w-3" />
            Invite
          </Button>
        </Show>
      </SettingsHeader>

      <Show when={isOverLimit() && limitCheck()}>
        {(check) => (
          <div class="flex items-start gap-3 border-b border-danger bg-danger/5 px-3 py-3">
            <Warning class="h-4 w-4 shrink-0 text-danger" weight="fill" />
            <div class="flex flex-1 flex-col gap-1">
              <p class="text-xs font-medium text-danger">User limit exceeded</p>
              <p class="text-2xs text-text-muted">
                You have {check().current} users but your plan allows {check().limit}. Remove{" "}
                {check().current - check().limit!} user(s) or upgrade your plan to invite new users.
              </p>
            </div>
          </div>
        )}
      </Show>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={props.loading}>
          <ListSkeleton />
        </Show>

        <Show when={!props.loading && props.members.length === 0 && props.invitations.length === 0}>
          <EmptyState onInviteClick={props.onInviteClick} canInvite={canInvite()} />
        </Show>

        <Show when={!props.loading && (props.members.length > 0 || props.invitations.length > 0)}>
          <div class={`grid items-center border-b border-border px-3 py-1.5 ${gridCols}`}>
            <span class="text-2xs font-medium text-text-muted">Name</span>
            <span class="text-2xs font-medium text-text-muted">Email</span>
            <span class="text-2xs font-medium text-text-muted">Role</span>
            <span class="text-2xs font-medium text-text-muted">Status</span>
            <span />
          </div>
          <For each={props.members}>
            {(member) => {
              const isCurrentUser = () => currentUser()?.id === member.userId
              const isOwner = member.role === "owner"
              const menuItems = (): DropdownMenuItem[] => [
                {
                  type: "item",
                  label: "Remove",
                  onClick: () => props.onRemoveMember(member),
                  variant: "danger",
                  disabled: !canManage() || isCurrentUser() || isOwner,
                },
              ]

              return (
                <div class={`group grid items-center px-3 py-2 transition-colors hover:bg-surface-muted ${gridCols}`}>
                  <div class="flex items-center gap-2 overflow-hidden">
                    <Avatar
                      size="sm"
                      src={member.user.image ?? undefined}
                      fallback={member.user.name || member.user.email}
                    />
                    <span class="truncate text-xs text-text">
                      {member.user.name || member.user.email}
                      <Show when={isCurrentUser()}>
                        <span class="text-text-muted"> (you)</span>
                      </Show>
                    </span>
                  </div>
                  <span class="truncate text-xs text-text-muted">{member.user.email}</span>
                  <Show
                    when={canManage() && !isCurrentUser() && !isOwner}
                    fallback={<span class="text-2xs text-text-muted">{capitalize(member.role)}</span>}
                  >
                    <Select
                      value={member.role}
                      options={roleOptions()}
                      onChange={(role) => handleRoleChange(member.id, role)}
                      disabled={updatingRole() === member.id}
                      class="h-5 text-[10px]"
                      wrapperClass="w-24"
                    />
                  </Show>
                  <div>
                    <Badge variant="success">Active</Badge>
                  </div>
                  <div
                    class="flex justify-end opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu
                      items={menuItems()}
                      trigger={
                        <IconButton variant="ghost" size="sm">
                          <DotsThree class="h-3.5 w-3.5" weight="bold" />
                        </IconButton>
                      }
                    />
                  </div>
                </div>
              )
            }}
          </For>

          <For each={props.invitations.filter((i) => i.status === "pending")}>
            {(invitation) => {
              const invMenuItems = (): DropdownMenuItem[] => [
                {
                  type: "item",
                  label: "Resend",
                  onClick: () => props.onResendInvitation(invitation),
                  disabled: !canManage(),
                },
                { type: "separator" },
                {
                  type: "item",
                  label: "Cancel",
                  onClick: () => props.onRemoveInvitation(invitation),
                  variant: "danger",
                  disabled: !canManage(),
                },
              ]

              return (
                <div class={`group grid items-center px-3 py-2 transition-colors hover:bg-surface-muted ${gridCols}`}>
                  <div class="flex items-center gap-2 overflow-hidden">
                    <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                      <EnvelopeSimple class="h-3 w-3 text-text-muted" />
                    </div>
                    <span class="truncate text-xs text-text-muted">—</span>
                  </div>
                  <span class="truncate text-xs text-text-muted">{invitation.email}</span>
                  <span class="text-2xs text-text-muted">{capitalize(invitation.role)}</span>
                  <div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                  <div
                    class="flex justify-end opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu
                      items={invMenuItems()}
                      trigger={
                        <IconButton variant="ghost" size="sm">
                          <DotsThree class="h-3.5 w-3.5" weight="bold" />
                        </IconButton>
                      }
                    />
                  </div>
                </div>
              )
            }}
          </For>
        </Show>
      </div>
    </div>
  )
}
