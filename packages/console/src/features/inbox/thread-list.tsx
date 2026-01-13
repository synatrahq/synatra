import { For, Show, onMount, onCleanup, createMemo } from "solid-js"
import { A, useSearchParams, useParams } from "@solidjs/router"
import { Skeleton, IconButton, DropdownMenu, Spinner, type DropdownMenuItem } from "../../ui"
import { EntityIcon } from "../../components"
import {
  DotsThree,
  Tray,
  Circle,
  CheckCircle,
  Clock,
  XCircle,
  Warning,
  Robot,
  Prohibit,
  FastForward,
} from "phosphor-solid-js"
import type { Threads } from "../../app/api"

export type ThreadListItem = Threads["items"][number]
type ThreadStatus = ThreadListItem["status"]

type ThreadListProps = {
  threads: ThreadListItem[]
  selectedId?: string
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  isArchiveView?: boolean
  onLoadMore?: () => void
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
  onUnarchive?: (id: string) => void
}

function formatRelativeTime(date: string) {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function StatusIcon(props: { status: ThreadStatus }) {
  switch (props.status) {
    case "waiting_human":
      return <Clock class="h-3 w-3 text-warning" />
    case "completed":
      return <CheckCircle class="h-3 w-3 text-success" weight="fill" />
    case "failed":
      return <XCircle class="h-3 w-3 text-danger" weight="fill" />
    case "cancelled":
      return <Warning class="h-3 w-3 text-text-muted" />
    case "rejected":
      return <Prohibit class="h-3 w-3 text-text-muted" weight="fill" />
    case "skipped":
      return <FastForward class="h-3 w-3 text-text-muted" weight="fill" />
    default:
      return <Circle class="h-3 w-3 text-accent" weight="fill" />
  }
}

function ThreadListItemComponent(props: {
  thread: ThreadListItem
  isSelected: boolean
  isArchiveView?: boolean
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
  onUnarchive?: (id: string) => void
}) {
  const params = useParams<{ channelSlug?: string }>()
  const [searchParams] = useSearchParams<{ status?: string; agent?: string }>()
  const isWaiting = () => props.thread.status === "waiting_human"

  const href = () => {
    const query = new URLSearchParams()
    if (searchParams.status) query.set("status", searchParams.status)
    if (searchParams.agent) query.set("agent", searchParams.agent)
    query.set("thread", props.thread.id)
    const base = params.channelSlug ? `/inbox/${params.channelSlug}` : "/inbox"
    return `${base}?${query.toString()}`
  }

  const menuItems = (): DropdownMenuItem[] => {
    const items: DropdownMenuItem[] = []
    if (props.isArchiveView) {
      items.push({ type: "item", label: "Unarchive", onClick: () => props.onUnarchive?.(props.thread.id) })
    } else {
      items.push({ type: "item", label: "Archive", onClick: () => props.onArchive?.(props.thread.id) })
    }
    items.push({ type: "item", label: "Delete", onClick: () => props.onDelete?.(props.thread.id), variant: "danger" })
    return items
  }

  return (
    <A
      href={href()}
      class="group flex cursor-pointer items-start gap-2.5 rounded-md mx-1 px-2.5 py-2 transition-colors"
      classList={{
        "bg-surface-muted": props.isSelected,
        "hover:bg-surface-muted": !props.isSelected,
      }}
    >
      <div class="pt-0.5">
        <EntityIcon
          icon={props.thread.agentIcon}
          iconColor={props.thread.agentIconColor}
          size={24}
          rounded="md"
          fallback={Robot}
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              class="truncate text-[13px] leading-5"
              classList={{
                "font-semibold text-text": isWaiting(),
                "font-medium text-text": !isWaiting(),
              }}
            >
              {props.thread.agentName ?? props.thread.agentId.slice(0, 8)}
            </span>
            <Show when={isWaiting()}>
              <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            </Show>
          </div>
          <div class="shrink-0">
            <span class="text-2xs text-text-muted group-hover:hidden">
              {formatRelativeTime(props.thread.updatedAt)}
            </span>
            <div class="hidden group-hover:block">
              <DropdownMenu
                items={menuItems()}
                trigger={
                  <IconButton variant="ghost" size="xs">
                    <DotsThree class="h-3.5 w-3.5" />
                  </IconButton>
                }
              />
            </div>
          </div>
        </div>

        <div class="mt-0.5 flex items-center gap-1.5">
          <StatusIcon status={props.thread.status} />
          <p class="truncate text-xs text-text-muted">{props.thread.subject}</p>
        </div>
      </div>
    </A>
  )
}

function ThreadListSkeleton() {
  return (
    <div class="flex flex-col gap-1 p-2">
      <For each={[1, 2, 3, 4, 5]}>
        {() => (
          <div class="flex items-start gap-3 rounded-lg px-3 py-2.5">
            <Skeleton class="h-8 w-8 rounded-md" />
            <div class="flex-1 space-y-2">
              <div class="flex items-center justify-between">
                <Skeleton class="h-3.5 w-24" />
                <Skeleton class="h-3 w-8" />
              </div>
              <Skeleton class="h-3 w-32" />
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

function EmptyState() {
  return (
    <div class="flex h-48 flex-col items-center justify-center gap-3 text-text-muted">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <Tray class="h-6 w-6" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-[13px] font-medium">No threads</p>
        <p class="mt-0.5 text-xs">Threads will appear here when agents run</p>
      </div>
    </div>
  )
}

export function ThreadList(props: ThreadListProps) {
  let sentinelRef: HTMLDivElement | undefined
  let observer: IntersectionObserver | undefined
  const hasMore = createMemo(() => !!props.hasMore)
  const loadingMore = createMemo(() => !!props.loadingMore)

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore() && !loadingMore()) {
          props.onLoadMore?.()
        }
      },
      { rootMargin: "100px" },
    )
    if (sentinelRef) {
      observer.observe(sentinelRef)
    }
  })

  onCleanup(() => {
    observer?.disconnect()
  })

  return (
    <div class="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
      <Show when={props.loading}>
        <ThreadListSkeleton />
      </Show>
      <Show when={!props.loading && props.threads.length === 0}>
        <EmptyState />
      </Show>
      <Show when={!props.loading && props.threads.length > 0}>
        <div class="flex flex-col py-1">
          <For each={props.threads}>
            {(thread) => (
              <ThreadListItemComponent
                thread={thread}
                isSelected={props.selectedId === thread.id}
                isArchiveView={props.isArchiveView}
                onDelete={props.onDelete}
                onArchive={props.onArchive}
                onUnarchive={props.onUnarchive}
              />
            )}
          </For>
          <Show when={props.loadingMore}>
            <div class="flex items-center justify-center py-3">
              <Spinner size="sm" />
            </div>
          </Show>
          <div ref={sentinelRef} class="h-1" />
        </div>
      </Show>
    </div>
  )
}
