import { createSignal, createEffect, onMount, onCleanup, type JSXElement } from "solid-js"
import { createPersistedSignal } from "../../../app/persisted-signal"

type ResizablePanelProps = {
  children: JSXElement
  defaultHeight: number
  minHeight: number
  maxHeight: number | (() => number)
  storageKey: string
}

export function ResizablePanel(props: ResizablePanelProps) {
  const [height, setHeight, initHeight] = createPersistedSignal(props.storageKey, (raw) => {
    const parsed = parseInt(raw, 10)
    return isNaN(parsed) ? null : parsed
  })
  const [isDragging, setIsDragging] = createSignal(false)
  let startY = 0
  let startHeight = 0

  onMount(() => {
    initHeight(props.defaultHeight)
  })

  const getMaxHeight = () => {
    return typeof props.maxHeight === "function" ? props.maxHeight() : props.maxHeight
  }

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startY = e.clientY
    startHeight = height()
    document.body.style.userSelect = "none"
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return
    const delta = startY - e.clientY
    const newHeight = Math.max(props.minHeight, Math.min(getMaxHeight(), startHeight + delta))
    setHeight(() => newHeight)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    document.body.style.userSelect = ""
  }

  createEffect(() => {
    if (isDragging()) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    } else {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  })

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove)
    window.removeEventListener("mouseup", handleMouseUp)
    document.body.style.userSelect = ""
  })

  return (
    <div class="shrink-0 flex flex-col" style={{ height: `${height()}px` }}>
      <div
        class="h-1 -mt-0.5 cursor-ns-resize shrink-0 hover:bg-accent/20 active:bg-accent/30 transition-colors relative z-10"
        classList={{ "bg-accent/30": isDragging() }}
        onMouseDown={handleMouseDown}
      />
      <div class="flex-1 min-h-0 overflow-hidden border-t border-border">{props.children}</div>
    </div>
  )
}
