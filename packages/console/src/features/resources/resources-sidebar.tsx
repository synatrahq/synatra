import { For, Show, createMemo } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { Plus, DotsThree } from "phosphor-solid-js"
import { DropdownMenu, type DropdownMenuItem } from "../../ui"
import { ResourceIcon } from "../../components"
import type { Resources } from "../../app/api"

type ResourcesSidebarProps = {
  resources: Resources
  onCreateClick: () => void
  onDeleteClick?: (resource: Resources[number]) => void
}

export function ResourcesSidebar(props: ResourcesSidebarProps) {
  const location = useLocation()
  const currentId = () => {
    const match = location.pathname.match(/^\/resources\/(.+)$/)
    return match?.[1]
  }

  const managedResources = createMemo(() => props.resources.filter((r) => r.managed))
  const regularResources = createMemo(() => props.resources.filter((r) => !r.managed))

  return (
    <div class="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <Show when={managedResources().length > 0}>
        <div class="px-1.5 pb-1 pt-3">
          <div class="px-1.5 pb-1.5">
            <span class="text-2xs font-medium text-text-muted">Synatra managed</span>
          </div>
          <For each={managedResources()}>
            {(resource) => {
              const isSelected = () => resource.id === currentId()
              return (
                <A
                  href={`/resources/${resource.id}`}
                  class="flex items-center gap-1.5 rounded py-1 pl-1.5 pr-2 text-xs font-medium transition-colors"
                  classList={{
                    "bg-surface-muted text-text": isSelected(),
                    "text-text-secondary hover:bg-surface-muted": !isSelected(),
                  }}
                >
                  <span class="flex h-4 w-4 shrink-0 items-center justify-center">
                    <ResourceIcon type={resource.type} class="h-3.5 w-3.5" />
                  </span>
                  <span class="truncate">{resource.name}</span>
                </A>
              )
            }}
          </For>
        </div>
      </Show>
      <div class="flex items-center justify-between px-3 pb-2 pt-2">
        <span class="text-2xs font-medium text-text-muted">Resources</span>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          onClick={() => props.onCreateClick()}
        >
          <Plus class="h-3.5 w-3.5" />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-1.5 pb-1.5 pt-0.5 scrollbar-thin">
        <div class="flex flex-col gap-0.5">
          <For each={regularResources()}>
            {(resource) => {
              const isSelected = () => resource.id === currentId()
              const menuItems: DropdownMenuItem[] = [
                { type: "item", label: "Delete", variant: "danger", onClick: () => props.onDeleteClick?.(resource) },
              ]
              return (
                <div
                  class="group/item flex items-center rounded transition-colors"
                  classList={{
                    "bg-surface-muted": isSelected(),
                    "hover:bg-surface-muted": !isSelected(),
                  }}
                >
                  <A
                    href={`/resources/${resource.id}`}
                    class="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1.5 text-xs font-medium"
                    classList={{
                      "text-text": isSelected(),
                      "text-text-secondary": !isSelected(),
                    }}
                  >
                    <span class="flex h-4 w-4 shrink-0 items-center justify-center">
                      <ResourceIcon type={resource.type} class="h-3.5 w-3.5" />
                    </span>
                    <span class="truncate">{resource.name}</span>
                  </A>
                  <div class="hidden shrink-0 pr-1 group-hover/item:block">
                    <DropdownMenu
                      items={menuItems}
                      trigger={
                        <span class="text-text-muted hover:text-text">
                          <DotsThree class="h-3.5 w-3.5" weight="bold" />
                        </span>
                      }
                    />
                  </div>
                </div>
              )
            }}
          </For>
          <Show when={regularResources().length === 0}>
            <div class="p-2 text-center text-xs text-text-muted">No resources yet</div>
          </Show>
        </div>
      </div>
    </div>
  )
}
