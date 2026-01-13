import { For, Show, createSignal, createMemo } from "solid-js"
import { A } from "@solidjs/router"
import { Button, IconButton, Input, Skeleton, DropdownMenu, type DropdownMenuItem } from "../../ui"
import { EntityIcon, LimitBadge } from "../../components"
import {
  Plus,
  MagnifyingGlass,
  ArrowClockwise,
  DotsThree,
  SortAscending,
  CircleDashed,
  Warning,
} from "phosphor-solid-js"
import { can } from "../../app"
import type { Agents } from "../../app/api"
import { checkAgentLimit } from "../../utils/subscription-limits"
import { useSubscription } from "../../utils/subscription"
import type { SubscriptionPlan } from "@synatra/core/types"

type SortKey = "name" | "updatedAt" | "createdAt"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "updatedAt", label: "Last updated" },
  { key: "createdAt", label: "Date created" },
]

type AgentListProps = {
  agents: Agents
  loading?: boolean
  onCreateClick?: () => void
  onRefresh?: () => void
  onEdit?: (agent: Agents[number]) => void
  onDelete?: (agent: Agents[number]) => void
}

function formatRelativeTime(date: string) {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years > 1 ? "s" : ""} ago`
}

function AgentCard(props: { agent: Agents[number]; onEdit?: () => void; onDelete?: () => void }) {
  const toolCount = () => props.agent.runtimeConfig?.tools?.length ?? 0

  const menuItems = createMemo(() => {
    const items: DropdownMenuItem[] = []
    if (can("agent", "update")) {
      items.push({ type: "item", label: "Edit details", onClick: () => props.onEdit?.() })
    }
    if (can("agent", "delete")) {
      if (items.length > 0) items.push({ type: "separator" })
      items.push({ type: "item", label: "Delete agent", onClick: () => props.onDelete?.(), variant: "danger" })
    }
    return items
  })

  return (
    <A
      href={`/agents/${props.agent.id}`}
      class="group flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-3 transition-colors hover:border-border-strong"
    >
      <div class="flex items-start justify-between">
        <EntityIcon icon={props.agent.icon} iconColor={props.agent.iconColor} size={32} rounded="md" />
        <Show when={menuItems().length > 0}>
          <DropdownMenu
            items={menuItems()}
            trigger={
              <IconButton variant="ghost" size="sm" class="opacity-0 group-hover:opacity-100">
                <DotsThree class="h-3.5 w-3.5" />
              </IconButton>
            }
          />
        </Show>
      </div>

      <div class="flex flex-col gap-0.5">
        <h4 class="truncate text-[13px] font-medium leading-5 text-text">{props.agent.name}</h4>
        <p class="line-clamp-2 text-[13px] leading-5 text-text-muted">{props.agent.description || "No description"}</p>
      </div>

      <div class="mt-auto flex items-center gap-4 border-t border-border pt-2 text-2xs leading-4">
        <div class="flex flex-col gap-0.5">
          <span class="font-medium text-text-muted">Tools</span>
          <span class="font-medium text-text-muted">{toolCount() > 0 ? toolCount() : "-"}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="font-medium text-text-muted">Updated</span>
          <span class="font-medium text-text-muted">{formatRelativeTime(props.agent.updatedAt)}</span>
        </div>
      </div>
    </A>
  )
}

function AgentCardSkeleton() {
  return (
    <div class="flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-3">
      <Skeleton class="h-8 w-8 rounded-md" />
      <div class="flex flex-col gap-1">
        <Skeleton class="h-4 w-28" />
        <Skeleton class="h-4 w-40" />
      </div>
      <div class="mt-1 flex items-center gap-4 border-t border-border pt-2">
        <Skeleton class="h-6 w-14" />
        <Skeleton class="h-6 w-16" />
      </div>
    </div>
  )
}

function EmptyState(props: { onCreateClick?: () => void }) {
  return (
    <div class="flex h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border p-6">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
        <CircleDashed class="h-5 w-5 text-text-muted" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-[13px] font-medium text-text">No agents yet</p>
        <Show
          when={can("agent", "create")}
          fallback={<p class="mt-0.5 text-xs text-text-muted">Contact an admin to create agents</p>}
        >
          <p class="mt-0.5 text-xs text-text-muted">Create your first agent to get started</p>
        </Show>
      </div>
      <Show when={can("agent", "create")}>
        <Button variant="default" size="sm" onClick={() => props.onCreateClick?.()}>
          <Plus class="h-3.5 w-3.5" />
          Create Agent
        </Button>
      </Show>
    </div>
  )
}

export function AgentList(props: AgentListProps) {
  const [search, setSearch] = createSignal("")
  const [sortKey, setSortKey] = createSignal<SortKey>("name")

  const subscriptionQuery = useSubscription()

  const limitCheck = createMemo(() => {
    if (!subscriptionQuery.data) return null
    return checkAgentLimit(props.agents.length, subscriptionQuery.data.plan as SubscriptionPlan)
  })

  const isOverLimit = createMemo(() => {
    const check = limitCheck()
    return !!check && check.limit !== null && check.current > check.limit
  })

  const sortMenuItems = (): DropdownMenuItem[] =>
    SORT_OPTIONS.map((option) => ({
      type: "item" as const,
      label: option.label + (sortKey() === option.key ? " (current)" : ""),
      onClick: () => setSortKey(option.key),
    }))

  const sortedAndFilteredAgents = () => {
    const q = search().toLowerCase()
    let filtered = props.agents
    if (q) {
      filtered = props.agents.filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q))
    }
    const key = sortKey()
    return filtered.slice().sort((a, b) => {
      if (key === "name") {
        return a.name.localeCompare(b.name)
      }
      return new Date(b[key]).getTime() - new Date(a[key]).getTime()
    })
  }

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="flex items-center justify-between border-b border-border px-4 py-2">
        <div class="flex items-center gap-2">
          <h1 class="text-[13px] font-medium leading-5 text-text">All agents</h1>
          <Show when={limitCheck()}>
            <LimitBadge current={limitCheck()!.current} limit={limitCheck()!.limit} label="agents" />
          </Show>
        </div>
        <Show when={can("agent", "create")}>
          <Button variant="default" size="sm" onClick={() => props.onCreateClick?.()}>
            <Plus class="h-3.5 w-3.5" />
            Agent
          </Button>
        </Show>
      </div>

      <Show when={isOverLimit() && limitCheck()}>
        {(check) => (
          <div class="flex items-start gap-3 border-b border-danger bg-danger/5 px-4 py-3">
            <Warning class="h-4 w-4 shrink-0 text-danger" weight="fill" />
            <div class="flex flex-1 flex-col gap-1">
              <p class="text-xs font-medium text-danger">Agent limit exceeded</p>
              <p class="text-2xs text-text-muted">
                You have {check().current} agents but your plan allows {check().limit}. Delete{" "}
                {check().current - check().limit!} agent(s) or upgrade your plan to create new agents.
              </p>
            </div>
          </div>
        )}
      </Show>

      <div class="flex items-center justify-between px-4 pt-3">
        <DropdownMenu
          items={sortMenuItems()}
          trigger={
            <IconButton variant="outline" size="md">
              <SortAscending class="h-3.5 w-3.5" />
            </IconButton>
          }
        />
        <div class="flex items-center gap-1">
          <div class="relative">
            <MagnifyingGlass class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted/60" />
            <Input
              type="text"
              placeholder="Search"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              class="w-40 pl-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            />
          </div>
          <div class="h-4 w-px bg-border" />
          <IconButton variant="outline" size="md" onClick={() => props.onRefresh?.()}>
            <ArrowClockwise class="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-4 pb-4 pt-3 scrollbar-thin">
        <Show when={props.loading}>
          <div class="grid gap-3" style={{ "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))" }}>
            <For each={[1, 2, 3, 4]}>{() => <AgentCardSkeleton />}</For>
          </div>
        </Show>

        <Show when={!props.loading && sortedAndFilteredAgents().length === 0 && props.agents.length === 0}>
          <EmptyState onCreateClick={props.onCreateClick} />
        </Show>

        <Show when={!props.loading && sortedAndFilteredAgents().length === 0 && props.agents.length > 0}>
          <div class="flex h-24 items-center justify-center text-xs text-text-muted">No agents match your search</div>
        </Show>

        <Show when={!props.loading && sortedAndFilteredAgents().length > 0}>
          <div class="grid gap-3" style={{ "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))" }}>
            <For each={sortedAndFilteredAgents()}>
              {(agent) => (
                <AgentCard
                  agent={agent}
                  onEdit={() => props.onEdit?.(agent)}
                  onDelete={() => props.onDelete?.(agent)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
