import { createSignal, createEffect, onMount, onCleanup, type JSXElement } from "solid-js"
import { createPersistedSignal } from "../../../app/persisted-signal"

type Props = {
  children: JSXElement
  side: "left" | "right"
  defaultWidth: number
  minWidth: number
  maxWidth: number
  storageKey: string
}

export function ResizableSidebar(props: Props) {
  const [width, setWidth, init] = createPersistedSignal(props.storageKey, (raw) => {
    const n = parseInt(raw, 10)
    return isNaN(n) ? null : n
  })
  const [dragging, setDragging] = createSignal(false)
  let startX = 0
  let startW = 0

  onMount(() => init(props.defaultWidth))

  function onMouseDown(e: MouseEvent) {
    e.preventDefault()
    setDragging(true)
    startX = e.clientX
    startW = width()
    document.body.style.userSelect = "none"
    document.body.style.cursor = "ew-resize"
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging()) return
    const delta = props.side === "right" ? e.clientX - startX : startX - e.clientX
    setWidth(Math.max(props.minWidth, Math.min(props.maxWidth, startW + delta)))
  }

  function onMouseUp() {
    setDragging(false)
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
  }

  createEffect(() => {
    if (!dragging()) return
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    onCleanup(() => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    })
  })

  onCleanup(() => {
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
  })

  const pos = props.side === "right" ? "right-0" : "left-0"

  return (
    <div class="relative shrink-0" style={{ width: `${width()}px` }}>
      {props.children}
      <div
        class={`absolute ${pos} top-0 bottom-0 w-1 cursor-ew-resize hover:bg-accent/20 active:bg-accent/30 transition-colors z-10`}
        classList={{ "bg-accent/30": dragging() }}
        onMouseDown={onMouseDown}
      />
    </div>
  )
}
