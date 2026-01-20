import { Tray } from "phosphor-solid-js"
import { FullScreenWorking } from "./working-indicator"

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
    <div class="flex flex-1 flex-col items-center justify-center">
      <FullScreenWorking />
    </div>
  )
}
