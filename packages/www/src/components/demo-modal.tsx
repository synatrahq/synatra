import { createSignal, createEffect, Show, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import { X } from "phosphor-solid-js"
import { DemoPreview } from "./demo-preview"
import type { DemoScenario } from "@synatra/core/types"

type DemoModalProps = {
  scenario: DemoScenario
  agent: { icon: string; iconColor: string; name: string }
  description: string
  category: string
  categoryColor: string
}

export function DemoModal(props: DemoModalProps) {
  const [isOpen, setIsOpen] = createSignal(false)
  let dialogRef: HTMLDivElement | undefined

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)

  const handleClickOutside = (e: MouseEvent) => {
    if (dialogRef && !dialogRef.contains(e.target as Node)) close()
  }

  createEffect(() => {
    if (!isOpen()) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    onCleanup(() => document.removeEventListener("keydown", onKey))
  })

  return (
    <>
      <button
        type="button"
        onClick={open}
        class="w-full text-left rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-700 transition-colors group cursor-pointer"
      >
        <div class="p-4">
          <div class="flex items-start justify-between mb-3">
            <span
              class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${props.categoryColor}`}
            >
              {props.category}
            </span>
            <span class="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors">Click to preview</span>
          </div>
          <h3 class="text-base font-medium text-white mb-1">{props.agent.name}</h3>
          <p class="text-xs text-gray-400 line-clamp-2">{props.description}</p>
        </div>
        <div class="border-t border-gray-800 bg-gray-950/50 px-4 py-3">
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <div class="h-2 w-2 rounded-full bg-gray-600" />
            <span>{props.scenario.sequence.length} steps</span>
            <span class="text-gray-700">·</span>
            <span>{props.scenario.title}</span>
          </div>
        </div>
      </button>

      <Show when={isOpen()}>
        <Portal>
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={handleClickOutside}
          >
            <div
              ref={dialogRef}
              class="relative w-full max-w-3xl rounded-lg border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden"
            >
              <div class="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
                <div class="flex items-center gap-3">
                  <span
                    class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${props.categoryColor}`}
                  >
                    {props.category}
                  </span>
                  <h2 class="text-sm font-medium text-white">{props.agent.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  class="flex items-center justify-center h-6 w-6 rounded bg-transparent text-white hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
              <DemoPreview
                scenario={props.scenario}
                agent={props.agent}
                speed="normal"
                loop
                class="h-[480px] border-0 rounded-none"
              />
              <div class="border-t border-gray-800 px-4 py-2.5">
                <p class="text-xs text-gray-400 line-clamp-2">{props.description}</p>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
