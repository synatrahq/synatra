import { createMemo } from "solid-js"
import { Badge } from "../../../../ui"
import { user } from "../../../../app/session"
import type { PlaygroundMessage } from "../../../../app/api"

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

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  if (email) return email.split("@")[0].slice(0, 2).toUpperCase()
  return "U"
}

export function UserMessage(props: { message: PlaygroundMessage }) {
  const initials = createMemo(() => getInitials(user()?.name, user()?.email))
  return (
    <div class="flex gap-2">
      <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent text-[10px] font-medium">
        {initials()}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="text-xs font-medium text-text">You</span>
          <span class="text-2xs text-text-muted">{formatRelativeTime(props.message.createdAt)}</span>
        </div>
        <p class="text-xs leading-relaxed text-text whitespace-pre-wrap">{props.message.content}</p>
      </div>
    </div>
  )
}

export function RejectedMessage(props: { reason: string | null }) {
  const initials = createMemo(() => getInitials(user()?.name, user()?.email))
  return (
    <div class="flex gap-2">
      <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent text-[10px] font-medium">
        {initials()}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="text-xs font-medium text-text">You</span>
          <Badge variant="secondary" class="text-2xs">
            Rejected
          </Badge>
        </div>
        <p class="text-xs leading-relaxed text-text-muted">{props.reason || "Rejected this action"}</p>
      </div>
    </div>
  )
}
