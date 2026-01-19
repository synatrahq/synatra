import { For, Show } from "solid-js"
import { Button, IconButton, DropdownMenu, Skeleton } from "../../ui"
import { SettingsHeader } from "./settings-header"
import type { DropdownMenuItem } from "../../ui"
import { Plus, DotsThree, TreeStructure } from "phosphor-solid-js"
import type { Environment } from "../../app/api"

type EnvironmentListProps = {
  environments: Environment[]
  loading?: boolean
  onCreateClick: () => void
  onEditClick: (env: Environment) => void
  onDeleteClick: (env: Environment) => void
}

const defaultColor = "#6366F1"

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
        <TreeStructure class="h-4 w-4 text-text-muted" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-xs font-medium text-text">No environments yet</p>
        <p class="mt-0.5 text-2xs text-text-muted">Create your first environment</p>
      </div>
      <Button variant="default" size="sm" onClick={() => props.onCreateClick()}>
        <Plus class="h-3 w-3" />
        Create
      </Button>
    </div>
  )
}

export function EnvironmentList(props: EnvironmentListProps) {
  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <SettingsHeader title="Environments">
        <Button variant="default" size="sm" onClick={() => props.onCreateClick()}>
          <Plus class="h-3 w-3" />
          Create
        </Button>
      </SettingsHeader>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={props.loading}>
          <ListSkeleton />
        </Show>

        <Show when={!props.loading && props.environments.length === 0}>
          <EmptyState onCreateClick={props.onCreateClick} />
        </Show>

        <Show when={!props.loading && props.environments.length > 0}>
          <div class={`grid items-center border-b border-border px-3 py-1.5 ${gridCols}`}>
            <span class="text-2xs font-medium text-text-muted">Name</span>
            <span class="text-2xs font-medium text-text-muted">Slug</span>
            <span class="text-2xs font-medium text-text-muted">Color</span>
            <span class="text-2xs font-medium text-text-muted">Status</span>
            <span />
          </div>
          <For each={props.environments}>
            {(env) => (
              <div
                class={`group grid cursor-pointer items-center px-3 py-2 transition-colors hover:bg-surface-muted ${gridCols}`}
                onClick={() => props.onEditClick(env)}
              >
                <span class="truncate text-xs text-text">{env.name}</span>
                <span class="truncate font-code text-2xs text-text-muted">{env.slug}</span>
                <div class="flex items-center gap-1.5">
                  <span class="h-2 w-2 shrink-0 rounded-full" style={{ background: env.color ?? defaultColor }} />
                  <span class="truncate font-code text-2xs text-text-muted">{env.color ?? defaultColor}</span>
                </div>
                <Show when={env.protected} fallback={<span class="text-2xs text-text-muted">—</span>}>
                  <span class="text-2xs text-text-muted">Protected</span>
                </Show>
                <div
                  class="flex justify-end opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenu
                    items={[
                      { type: "item", label: "Edit", onClick: () => props.onEditClick(env) },
                      { type: "separator" },
                      {
                        type: "item",
                        label: "Delete",
                        onClick: () => props.onDeleteClick(env),
                        variant: "danger",
                        disabled: env.protected,
                      },
                    ]}
                    trigger={
                      <IconButton variant="ghost" size="sm">
                        <DotsThree class="h-3.5 w-3.5" weight="bold" />
                      </IconButton>
                    }
                  />
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}
