import { Skeleton, SkeletonText } from "../../../ui"
import { Tray } from "phosphor-solid-js"

export function EmptyState() {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 p-8">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <Tray class="h-6 w-6 text-text-muted/50" />
      </div>
      <div class="text-center">
        <p class="text-[13px] font-medium text-text">Select a thread</p>
        <p class="mt-0.5 text-xs text-text-muted">Choose a thread from the list to view details</p>
      </div>
    </div>
  )
}

export function LoadingState() {
  return (
    <div class="flex flex-1 flex-col">
      <div class="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-2.5">
        <Skeleton class="h-6 w-6 rounded-full" />
        <div class="space-y-1.5 flex-1">
          <div class="flex items-center gap-1.5">
            <Skeleton class="h-3.5 w-32" />
            <Skeleton class="h-4 w-14 rounded-full" />
          </div>
          <Skeleton class="h-3 w-40" />
        </div>
      </div>
      <div class="flex-1 px-4 py-4 space-y-4">
        <div class="flex gap-2.5">
          <Skeleton class="h-6 w-6 rounded-full shrink-0" />
          <div class="flex-1 space-y-1.5">
            <Skeleton class="h-3 w-20" />
            <SkeletonText lines={2} />
          </div>
        </div>
        <div class="flex gap-2.5">
          <Skeleton class="h-6 w-6 rounded-full shrink-0" />
          <div class="flex-1 space-y-1.5">
            <Skeleton class="h-3 w-20" />
            <SkeletonText lines={1} />
          </div>
        </div>
      </div>
    </div>
  )
}
