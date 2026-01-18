import { Show, For, type JSX } from "solid-js"
import { Gear, ChatCircle, Plus, X, CirclesThree } from "phosphor-solid-js"
import { Switch } from "../../../ui"
import type { Selection } from "./constants"
import { getSelectionKey } from "./constants"

type TriggerEnvironmentInfo = {
  id: string
  triggerId: string
  environmentId: string
  channelId: string
  webhookSecret: string | null
  debugSecret: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  environment: { id: string; name: string; slug: string; color: string }
  channel: { id: string; name: string; slug: string }
}

type EnvironmentOption = {
  id: string
  name: string
  color: string
}

type OutlinePanelProps = {
  environments: TriggerEnvironmentInfo[]
  availableEnvironments: EnvironmentOption[]
  selection: Selection | null
  onSelect: (selection: Selection) => void
  onAddEnvironment?: () => void
  onRemoveEnvironment?: (environmentId: string) => void
  onToggleEnvironment?: (environmentId: string) => void
}

type SectionHeaderProps = {
  icon: JSX.Element
  label: string
  count?: number
  onAdd?: () => void
}

function SectionHeader(props: SectionHeaderProps) {
  return (
    <div class="flex items-center justify-between px-3 py-2 text-xs">
      <div class="flex items-center gap-2">
        {props.icon}
        <span class="font-medium text-text">{props.label}</span>
        <Show when={props.count !== undefined}>
          <span class="text-[10px] text-text-muted">({props.count})</span>
        </Show>
      </div>
      <Show when={props.onAdd}>
        <button
          type="button"
          class="rounded p-0.5 text-text-muted transition-colors hover:text-text"
          onClick={props.onAdd}
        >
          <Plus class="h-3 w-3" />
        </button>
      </Show>
    </div>
  )
}

type SimpleTreeItemProps = {
  icon: () => JSX.Element
  label: string
  selected: boolean
  onClick: () => void
}

function SimpleTreeItem(props: SimpleTreeItemProps) {
  return (
    <button
      type="button"
      class="group flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text transition-colors"
      classList={{
        "bg-surface-muted": props.selected,
        "hover:bg-surface-muted": !props.selected,
      }}
      onClick={props.onClick}
    >
      {props.icon()}
      <span class="truncate">{props.label}</span>
    </button>
  )
}

export function OutlinePanel(props: OutlinePanelProps) {
  const isSelected = (selection: Selection) => {
    if (!props.selection) return false
    return getSelectionKey(props.selection) === getSelectionKey(selection)
  }

  return (
    <div class="flex h-full flex-col overflow-hidden bg-surface-elevated">
      <div class="flex-1 overflow-y-auto py-1 scrollbar-thin">
        <div class="mb-2">
          <div class="px-3 py-1">
            <span class="text-2xs font-medium text-text-muted">General</span>
          </div>
          <SimpleTreeItem
            icon={() => <Gear class="h-3.5 w-3.5 shrink-0 text-text-muted" weight="duotone" />}
            label="Settings"
            selected={isSelected({ type: "settings" })}
            onClick={() => props.onSelect({ type: "settings" })}
          />
          <SimpleTreeItem
            icon={() => <ChatCircle class="h-3.5 w-3.5 shrink-0 text-accent" weight="duotone" />}
            label="Prompt"
            selected={isSelected({ type: "prompt" })}
            onClick={() => props.onSelect({ type: "prompt" })}
          />
        </div>

        <div class="border-t border-border pt-2">
          <SectionHeader
            icon={<CirclesThree class="h-3 w-3 text-accent" weight="duotone" />}
            label="Environments"
            count={props.environments.length}
            onAdd={props.availableEnvironments.length > 0 ? props.onAddEnvironment : undefined}
          />
          <Show
            when={props.environments.length > 0}
            fallback={<div class="px-3 py-1 text-[10px] italic text-text-muted">No environments</div>}
          >
            <For each={props.environments}>
              {(env) => {
                const selected = () => isSelected({ type: "environment", environmentId: env.environmentId })
                return (
                  <button
                    type="button"
                    class="group flex h-7 w-full items-center gap-2 px-3 text-xs text-text transition-colors"
                    classList={{
                      "bg-surface-muted": selected(),
                      "hover:bg-surface-muted": !selected(),
                    }}
                    onClick={() => props.onSelect({ type: "environment", environmentId: env.environmentId })}
                  >
                    <span
                      class="h-2 w-2 shrink-0 rounded-full"
                      classList={{ "opacity-50": !env.active }}
                      style={{ background: env.environment.color ?? "#3B82F6" }}
                    />
                    <span class="truncate" classList={{ "opacity-50": !env.active }}>
                      {env.environment.name}
                    </span>
                    <span class="ml-auto flex items-center gap-1">
                      <Switch
                        checked={env.active}
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onToggleEnvironment?.(env.environmentId)
                        }}
                        class="scale-[0.7] opacity-0 transition-opacity group-hover:opacity-100"
                      />
                      <span
                        class="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onRemoveEnvironment?.(env.environmentId)
                        }}
                      >
                        <X class="h-3 w-3" />
                      </span>
                    </span>
                  </button>
                )
              }}
            </For>
          </Show>
        </div>
      </div>
    </div>
  )
}
