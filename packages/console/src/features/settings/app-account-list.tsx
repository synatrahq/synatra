import { For, Show } from "solid-js"
import { Button, IconButton, DropdownMenu, type DropdownMenuItem } from "../../ui"
import { AppIcon } from "../../components"
import { Plus, DotsThree } from "phosphor-solid-js"
import type { AppAccount } from "../../app/api"

function getAccountDetail(account: AppAccount): string {
  if (!account.metadata) return "-"
  if ("workspaceName" in account.metadata) {
    return account.metadata.workspaceName ?? "-"
  }
  if ("accountLogin" in account.metadata) {
    return `${account.metadata.accountLogin} (${account.metadata.accountType})`
  }
  return "-"
}

type AppAccountListProps = {
  accounts: AppAccount[]
  loading?: boolean
  onConnectClick: (appId: string) => void
  onDeleteClick: (account: AppAccount) => void
}

const gridCols = "grid-cols-[minmax(120px,2fr)_1fr_2fr_40px]"

const APP_INFO: Record<string, { name: string; description: string; comingSoon?: boolean }> = {
  intercom: {
    name: "Intercom",
    description: "Trigger agents on customer messages",
    comingSoon: true,
  },
  github: {
    name: "GitHub",
    description: "Access repositories, issues, and pull requests",
  },
}

function ListSkeleton() {
  return (
    <div class="flex flex-col">
      <For each={[1, 2, 3]}>
        {() => (
          <div class={`grid items-center px-3 py-2 ${gridCols}`}>
            <div class="h-3 w-28 animate-pulse rounded bg-surface-muted" />
            <div class="h-3 w-16 animate-pulse rounded bg-surface-muted" />
            <div class="h-3 w-40 animate-pulse rounded bg-surface-muted" />
            <div />
          </div>
        )}
      </For>
    </div>
  )
}

function EmptyState(props: { onConnectClick: (appId: string) => void }) {
  return (
    <div class="flex flex-col gap-4 p-4">
      <div class="text-center">
        <p class="text-xs font-medium text-text">Connect your apps</p>
        <p class="mt-0.5 text-2xs text-text-muted">Connect SaaS apps to trigger agents on events</p>
      </div>
      <div class="flex flex-col gap-2">
        <For each={Object.entries(APP_INFO)}>
          {([appId, info]) => (
            <div class="flex items-center justify-between rounded-lg border border-border p-3">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted">
                  <AppIcon appId={appId} class="h-4 w-4" />
                </div>
                <div>
                  <div class="flex items-center gap-1.5">
                    <p class="text-xs font-medium text-text">{info.name}</p>
                    <Show when={info.comingSoon}>
                      <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                        Coming soon
                      </span>
                    </Show>
                  </div>
                  <p class="text-2xs text-text-muted">{info.description}</p>
                </div>
              </div>
              <Show
                when={info.comingSoon}
                fallback={
                  <Button variant="default" size="sm" onClick={() => props.onConnectClick(appId)}>
                    Connect
                  </Button>
                }
              >
                <Button variant="default" size="sm" disabled>
                  Connect
                </Button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export function AppAccountList(props: AppAccountListProps) {
  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2">
        <h1 class="text-xs font-medium text-text">Apps</h1>
        <DropdownMenu
          items={Object.entries(APP_INFO)
            .filter(([, info]) => !info.comingSoon)
            .map(([appId, info]) => ({
              type: "item" as const,
              label: info.name,
              icon: <AppIcon appId={appId} class="h-3.5 w-3.5" />,
              onClick: () => props.onConnectClick(appId),
            }))}
          trigger={
            <Button variant="default" size="sm">
              <Plus class="h-3 w-3" />
              Connect
            </Button>
          }
        />
      </div>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <Show when={props.loading}>
          <ListSkeleton />
        </Show>

        <Show when={!props.loading && props.accounts.length === 0}>
          <EmptyState onConnectClick={props.onConnectClick} />
        </Show>

        <Show when={!props.loading && props.accounts.length > 0}>
          <div class={`grid items-center border-b border-border px-3 py-1.5 ${gridCols}`}>
            <span class="text-2xs font-medium text-text-muted">Name</span>
            <span class="text-2xs font-medium text-text-muted">App</span>
            <span class="text-2xs font-medium text-text-muted">Workspace</span>
            <span />
          </div>
          <For each={props.accounts}>
            {(account) => {
              const menuItems: DropdownMenuItem[] = [
                { type: "item", label: "Delete", onClick: () => props.onDeleteClick(account), variant: "danger" },
              ]

              return (
                <div class={`group grid items-center px-3 py-2 transition-colors hover:bg-surface-muted ${gridCols}`}>
                  <div class="flex items-center gap-2 overflow-hidden">
                    <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                      <AppIcon appId={account.appId} class="h-3 w-3" />
                    </div>
                    <span class="truncate text-xs text-text">{account.name}</span>
                  </div>
                  <span class="truncate text-2xs text-text-muted capitalize">
                    {APP_INFO[account.appId]?.name ?? account.appId}
                  </span>
                  <span class="truncate text-2xs text-text-muted">{getAccountDetail(account)}</span>
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
