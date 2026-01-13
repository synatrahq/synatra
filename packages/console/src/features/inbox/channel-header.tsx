import { Show, For } from "solid-js"
import { Hash, Gear, Robot, Plus, UsersThree } from "phosphor-solid-js"
import { Avatar, AvatarGroup, IconButton } from "../../ui"
import { EntityIcon } from "../../components"
import type { ChannelMembers, ChannelAgents } from "../../app/api"

type ChannelHeaderProps = {
  channelName: string
  members: ChannelMembers
  agents: ChannelAgents
  isOwner: boolean
  onMembersClick: () => void
  onAgentsClick: () => void
  onSettingsClick: () => void
}

export function ChannelHeader(props: ChannelHeaderProps) {
  const visibleMembers = () => props.members.slice(0, 3)
  const remainingMembers = () => Math.max(0, props.members.length - 3)
  const visibleAgents = () => props.agents.slice(0, 3)
  const remainingAgents = () => Math.max(0, props.agents.length - 3)

  return (
    <div class="flex items-center justify-between px-3.5 py-2">
      <div class="flex items-center gap-2">
        <Hash class="h-4 w-4 text-text-muted" weight="bold" />
        <span class="text-sm font-medium text-text">{props.channelName}</span>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
          onClick={props.onMembersClick}
        >
          <Show
            when={props.members.length > 0}
            fallback={
              <div class="flex items-center gap-1">
                <UsersThree class="h-3.5 w-3.5" />
                <span>0</span>
              </div>
            }
          >
            <AvatarGroup>
              <For each={visibleMembers()}>
                {(member) => (
                  <Avatar
                    size="xs"
                    src={member.user.image ?? undefined}
                    alt={member.user.name ?? member.user.email}
                    fallback={member.user.name ?? member.user.email}
                    class="border-2 border-surface"
                  />
                )}
              </For>
            </AvatarGroup>
            <Show when={remainingMembers() > 0}>
              <span class="text-2xs text-text-muted">+{remainingMembers()}</span>
            </Show>
          </Show>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
          onClick={props.onAgentsClick}
        >
          <Show
            when={props.agents.length > 0}
            fallback={
              <div class="flex items-center gap-1">
                <Robot class="h-3.5 w-3.5" />
                <span>0</span>
              </div>
            }
          >
            <div class="flex -space-x-1">
              <For each={visibleAgents()}>
                {(item) => (
                  <EntityIcon icon={item.agent.icon} iconColor={item.agent.iconColor} size={20} fallback={Robot} />
                )}
              </For>
            </div>
            <Show when={remainingAgents() > 0}>
              <span class="text-2xs text-text-muted">+{remainingAgents()}</span>
            </Show>
          </Show>
        </button>

        <Show when={props.isOwner}>
          <IconButton variant="ghost" size="xs" onClick={props.onSettingsClick}>
            <Gear class="h-3.5 w-3.5" />
          </IconButton>
        </Show>
      </div>
    </div>
  )
}
