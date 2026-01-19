import { For, Show } from "solid-js"
import { Button, IconButton, DropdownMenu, Skeleton } from "../../ui"
import { SettingsHeader } from "./settings-header"
import type { DropdownMenuItem } from "../../ui"
import { Plus, DotsThree, Plugs, Circle } from "phosphor-solid-js"
import type { Connector } from "../../app/api"

type ConnectorListProps = {
  connectors: Connector[]
  loading?: boolean
  onCreateClick: () => void
  onRegenerateClick: (connector: Connector) => void
  onDeleteClick: (connector: Connector) => void
}

const gridCols = "grid-cols-[minmax(120px,2fr)_1fr_1fr_1fr_40px]"

function ListSkeleton() {
  return (
    <div class="flex flex-col">
      <For each={[1, 2, 3]}>
        {() => (
          <div class={`grid items-center px-3 py-2 ${gridCols}`}>
            <Skeleton class="h-3 w-28" />
            <Skeleton class="h-3 w-16" />
            <Skeleton class="h-3 w-16" />
            <Skeleton class="h-3 w-12" />
            <div />
          </div>
        )}
      </For>
    </div>
  )
}

function EmptyState(props: { onCreateClick: () => void }) {
  return (
    <div class="flex h-48 flex-col items-center justify-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted">
        <Plugs class="h-4 w-4 text-text-muted" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-xs font-medium text-text">No connectors yet</p>
        <p class="mt-0.5 text-2xs text-text-muted">Create a connector to access resources in your VPC</p>
      </div>
      <Button variant="default" size="sm" onClick={() => props.onCreateClick()}>
        <Plus class="h-3 w-3" />
        Create
      </Button>
    </div>
  )
}

function StatusBadge(props: { status: Connector["status"] }) {
  const color = () => {
    switch (props.status) {
      case "online":
        return "text-success"
      case "error":
        return "text-danger"
      default:
        return "text-text-muted"
    }
  }

  return (
    <div class="flex items-center gap-1.5">
      <Circle class={`h-2 w-2 ${color()}`} weight="fill" />
      <span class="text-2xs text-text-muted capitalize">{props.status}</span>
    </div>
  )
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Never"
  const date = new Date(lastSeenAt)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ConnectorList(props: ConnectorListProps) {
  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <SettingsHeader title="Connectors">
        <Button variant="default" size="sm" onClick={() => props.onCreateClick()}>
          <Plus class="h-3 w-3" />
          Create
        </Button>
      </SettingsHeader>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={props.loading}>
          <ListSkeleton />
        </Show>

        <Show when={!props.loading && props.connectors.length === 0}>
          <EmptyState onCreateClick={props.onCreateClick} />
        </Show>

        <Show when={!props.loading && props.connectors.length > 0}>
          <div class={`grid items-center border-b border-border px-3 py-1.5 ${gridCols}`}>
            <span class="text-2xs font-medium text-text-muted">Name</span>
            <span class="text-2xs font-medium text-text-muted">Status</span>
            <span class="text-2xs font-medium text-text-muted">Last seen</span>
            <span class="text-2xs font-medium text-text-muted">Version</span>
            <span />
          </div>
          <For each={props.connectors}>
            {(connector) => {
              const menuItems: DropdownMenuItem[] = [
                { type: "item", label: "Regenerate token", onClick: () => props.onRegenerateClick(connector) },
                { type: "separator" },
                { type: "item", label: "Delete", onClick: () => props.onDeleteClick(connector), variant: "danger" },
              ]

              return (
                <div class={`group grid items-center px-3 py-2 transition-colors hover:bg-surface-muted ${gridCols}`}>
                  <span class="truncate text-xs text-text">{connector.name}</span>
                  <StatusBadge status={connector.status} />
                  <span class="truncate text-2xs text-text-muted">{formatLastSeen(connector.lastSeenAt)}</span>
                  <span class="truncate font-code text-2xs text-text-muted">{connector.metadata?.version ?? "—"}</span>
                  <div
                    class="flex justify-end opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu
                      items={menuItems}
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
