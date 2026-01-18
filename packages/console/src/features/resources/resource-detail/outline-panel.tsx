import { Show, For, createSignal, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { Plus, X, WarningCircle, TreeStructure } from "phosphor-solid-js"
import type { Selection } from "./constants"
import type { Resources, Environment } from "../../../app/api"
import { getSelectionKey } from "./constants"

type OutlinePanelProps = {
  configs: Resources[number]["configs"][number][]
  environments: Environment[]
  selection: Selection | null
  unsavedEnvIds: Set<string>
  onSelect: (selection: Selection) => void
  onAddEnvironment?: (environmentId: string) => void
  onRemoveEnvironment?: (environmentId: string) => void
}

type SectionHeaderProps = {
  icon: JSX.Element
  label: string
  count?: number
  addMenu?: JSX.Element
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
      {props.addMenu}
    </div>
  )
}

export function OutlinePanel(props: OutlinePanelProps) {
  const [dropdownOpen, setDropdownOpen] = createSignal(false)

  const isSelected = (selection: Selection) => {
    if (!props.selection) return false
    return getSelectionKey(props.selection) === getSelectionKey(selection)
  }

  // Environments that don't have a config yet
  const availableEnvironments = () => {
    const configuredEnvIds = new Set(props.configs.map((c) => c.environmentId))
    return props.environments.filter((e) => !configuredEnvIds.has(e.id))
  }

  const handleAddEnvironment = (envId: string) => {
    props.onAddEnvironment?.(envId)
    setDropdownOpen(false)
  }

  return (
    <div class="flex h-full flex-col overflow-hidden bg-surface-elevated">
      <div class="flex-1 overflow-y-auto py-1 scrollbar-thin">
        <SectionHeader
          icon={<TreeStructure class="h-3 w-3 text-accent" weight="duotone" />}
          label="Environments"
          count={props.configs.length}
          addMenu={
            <Show when={availableEnvironments().length > 0}>
              {(() => {
                let buttonRef: HTMLButtonElement | undefined
                return (
                  <>
                    <button
                      ref={buttonRef}
                      type="button"
                      class="rounded p-0.5 text-text-muted transition-colors hover:text-text"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDropdownOpen(!dropdownOpen())
                      }}
                    >
                      <Plus class="h-3 w-3" />
                    </button>
                    <Show when={dropdownOpen()}>
                      <Portal>
                        <div class="fixed inset-0 z-50" onClick={() => setDropdownOpen(false)} />
                        <div
                          class="fixed z-50 min-w-[140px] rounded-md border border-border bg-surface py-1 shadow-elevated"
                          style={{
                            top: `${(buttonRef?.getBoundingClientRect().bottom ?? 0) + 4}px`,
                            left: `${buttonRef?.getBoundingClientRect().left ?? 0}px`,
                          }}
                        >
                          <For each={availableEnvironments()}>
                            {(env) => (
                              <button
                                type="button"
                                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text transition-colors hover:bg-surface-muted"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleAddEnvironment(env.id)
                                }}
                              >
                                <span
                                  class="h-2 w-2 shrink-0 rounded-full"
                                  style={{ background: env.color ?? "#3B82F6" }}
                                />
                                {env.name}
                              </button>
                            )}
                          </For>
                        </div>
                      </Portal>
                    </Show>
                  </>
                )
              })()}
            </Show>
          }
        />

        <Show
          when={props.configs.length > 0}
          fallback={<div class="py-1 pl-7 pr-3 text-[10px] italic text-text-muted">No environments</div>}
        >
          <For each={props.configs}>
            {(config) => {
              const selected = () =>
                isSelected({
                  type: "environment",
                  environmentId: config.environmentId,
                })
              const hasUnsavedChanges = () => props.unsavedEnvIds.has(config.environmentId)
              return (
                <button
                  type="button"
                  class="group flex w-full items-center gap-2 py-1 pl-7 pr-3 text-xs text-text transition-colors"
                  classList={{
                    "bg-surface-muted": selected(),
                    "hover:bg-surface-muted": !selected(),
                  }}
                  onClick={() => props.onSelect({ type: "environment", environmentId: config.environmentId })}
                >
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: config.environmentColor ?? "#3B82F6" }}
                  />
                  <span class="truncate">{config.environmentName}</span>
                  <span
                    class="ml-auto rounded p-0.5"
                    classList={{
                      "text-text-muted opacity-50 group-hover:hidden": hasUnsavedChanges(),
                      "text-text-muted hidden group-hover:block hover:text-danger": !hasUnsavedChanges(),
                    }}
                    onClick={(e) => {
                      if (!hasUnsavedChanges()) {
                        e.stopPropagation()
                        props.onRemoveEnvironment?.(config.environmentId)
                      }
                    }}
                  >
                    <Show when={hasUnsavedChanges()} fallback={<X class="h-3 w-3" />}>
                      <WarningCircle class="h-3 w-3" title="Unsaved changes" />
                    </Show>
                  </span>
                  <Show when={hasUnsavedChanges()}>
                    <span
                      class="ml-auto hidden rounded p-0.5 text-text-muted transition-colors hover:text-danger group-hover:block"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onRemoveEnvironment?.(config.environmentId)
                      }}
                    >
                      <X class="h-3 w-3" />
                    </span>
                  </Show>
                </button>
              )
            }}
          </For>
        </Show>
      </div>
    </div>
  )
}
