import { createSignal, onMount, onCleanup, Show, For } from "solid-js"
import { Portal } from "solid-js/web"
import { CaretDown, Check, X, DotsThree, Play, ArrowLineDown } from "phosphor-solid-js"
import { Badge } from "../../ui"
import type { PromptReleases } from "../../app/api"

type Props = {
  currentVersion: string | null
  currentReleaseId: string | null
  releases: PromptReleases
  hasUndeployedChanges?: boolean
  workingCopyUpdatedAt?: string | null
  onAdopt?: (releaseId: string) => void
  onCheckout?: (releaseId: string) => void
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
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

function ReleaseItem(props: {
  release: PromptReleases[number]
  isCurrent: boolean
  isLive: boolean
  onSetLive: () => void
  onLoadToEditor: () => void
}) {
  const [menuOpen, setMenuOpen] = createSignal(false)
  const [menuPos, setMenuPos] = createSignal({ top: 0, left: 0 })
  let buttonRef: HTMLButtonElement | undefined
  let menuRef: HTMLDivElement | undefined

  const displayName = () => props.release.createdBy.name || props.release.createdBy.email

  const handleMenuClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (buttonRef) {
      const rect = buttonRef.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: rect.left })
    }
    setMenuOpen(!menuOpen())
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (
      menuOpen() &&
      menuRef &&
      !menuRef.contains(e.target as Node) &&
      buttonRef &&
      !buttonRef.contains(e.target as Node)
    ) {
      setMenuOpen(false)
    }
  }

  onMount(() => document.addEventListener("click", handleClickOutside))
  onCleanup(() => document.removeEventListener("click", handleClickOutside))

  return (
    <div class="group flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-text">{props.release.version}</span>
          <Show when={props.isLive}>
            <Badge variant="success" class="text-[10px]">
              Live
            </Badge>
          </Show>
        </div>
        <Show when={props.release.description}>
          <span class="line-clamp-1 text-[11px] text-text-muted">{props.release.description}</span>
        </Show>
        <span class="text-[11px] text-text-muted">
          {displayName()} · {formatRelativeTime(props.release.publishedAt ?? props.release.createdAt)}
        </span>
      </div>
      <Show when={props.isCurrent}>
        <Check class="h-4 w-4 shrink-0 text-accent" weight="bold" />
      </Show>
      <Show when={!props.isCurrent}>
        <button
          ref={buttonRef}
          type="button"
          class="shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:bg-surface-muted hover:text-text group-hover:opacity-100"
          classList={{ "opacity-100": menuOpen() }}
          onClick={handleMenuClick}
        >
          <DotsThree class="h-4 w-4" weight="bold" />
        </button>
        <Show when={menuOpen()}>
          <Portal>
            <div
              ref={menuRef}
              class="fixed z-[200] min-w-[140px] rounded-md border border-border bg-surface-floating py-1 shadow-elevated"
              style={{ top: `${menuPos().top}px`, left: `${menuPos().left}px` }}
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text transition-colors hover:bg-surface-muted"
                onClick={() => {
                  setMenuOpen(false)
                  props.onSetLive()
                }}
              >
                <Play class="h-3.5 w-3.5 text-text-muted" weight="bold" />
                Set live
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text transition-colors hover:bg-surface-muted"
                onClick={() => {
                  setMenuOpen(false)
                  props.onLoadToEditor()
                }}
              >
                <ArrowLineDown class="h-3.5 w-3.5 text-text-muted" weight="bold" />
                Load to editor
              </button>
            </div>
          </Portal>
        </Show>
      </Show>
    </div>
  )
}

export function VersionControl(props: Props) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ top: 0, left: 0 })
  let triggerRef: HTMLButtonElement | undefined
  let popoverRef: HTMLDivElement | undefined

  const handleTriggerClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (triggerRef) {
      const rect = triggerRef.getBoundingClientRect()
      setPosition({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen(!open())
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (
      open() &&
      popoverRef &&
      !popoverRef.contains(e.target as Node) &&
      triggerRef &&
      !triggerRef.contains(e.target as Node)
    ) {
      setOpen(false)
    }
  }

  onMount(() => document.addEventListener("click", handleClickOutside))
  onCleanup(() => document.removeEventListener("click", handleClickOutside))

  const handleSetLive = (releaseId: string) => {
    setOpen(false)
    props.onAdopt?.(releaseId)
  }

  const handleLoadToEditor = (releaseId: string) => {
    setOpen(false)
    props.onCheckout?.(releaseId)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        onClick={handleTriggerClick}
      >
        <span class="h-2 w-2 rounded-full bg-success" />
        <span>Live</span>
        <span class="text-text">v{props.currentVersion ?? "0.0.0"}</span>
        <Show when={props.hasUndeployedChanges}>
          <span class="h-1.5 w-1.5 rounded-full bg-warning" />
        </Show>
        <CaretDown class="h-3 w-3" weight="bold" />
      </button>

      <Show when={open()}>
        <Portal>
          <div
            ref={popoverRef}
            class="fixed z-50 w-[320px] overflow-hidden rounded-md border border-border bg-surface-floating shadow-elevated"
            style={{ top: `${position().top}px`, left: `${position().left}px` }}
          >
            <div class="flex items-center justify-between border-b border-border px-3 py-2">
              <span class="text-xs font-medium text-text-muted">Prompt version</span>
              <button
                type="button"
                class="rounded p-0.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                onClick={() => setOpen(false)}
              >
                <X class="h-3.5 w-3.5" weight="bold" />
              </button>
            </div>

            <div class="max-h-[280px] overflow-y-auto">
              <Show when={props.hasUndeployedChanges}>
                <div class="flex items-start justify-between gap-2 border-b border-border bg-surface-muted/50 px-3 py-2.5">
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-medium text-text">Modified</span>
                      <Badge variant="warning" class="text-[10px]">
                        Working copy
                      </Badge>
                    </div>
                    <span class="text-[11px] text-text-muted">
                      You · {props.workingCopyUpdatedAt ? formatRelativeTime(props.workingCopyUpdatedAt) : "just now"}
                    </span>
                  </div>
                  <Check class="h-4 w-4 shrink-0 text-accent" weight="bold" />
                </div>
              </Show>

              <For each={props.releases}>
                {(release) => (
                  <ReleaseItem
                    release={release}
                    isCurrent={!props.hasUndeployedChanges && release.id === props.currentReleaseId}
                    isLive={release.id === props.currentReleaseId}
                    onSetLive={() => handleSetLive(release.id)}
                    onLoadToEditor={() => handleLoadToEditor(release.id)}
                  />
                )}
              </For>

              <Show when={props.releases.length === 0}>
                <div class="px-3 py-6 text-center text-xs text-text-muted">No releases yet</div>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
