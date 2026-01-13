import { createSignal, createEffect, splitProps, on, type ParentProps } from "solid-js"

type TooltipSide = "top" | "bottom" | "left" | "right"

interface TooltipProps extends ParentProps {
  content: string
  class?: string
  side?: TooltipSide
}

export function Tooltip(props: TooltipProps) {
  const [local] = splitProps(props, ["class", "content", "children", "side"])
  const [show, setShow] = createSignal(false)
  const [position, setPosition] = createSignal({ left: 0, top: 0 })
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>()
  const [tooltipRef, setTooltipRef] = createSignal<HTMLDivElement>()

  createEffect(
    on(
      () => [show(), local.content] as const,
      ([visible]) => {
        if (!visible) return
        requestAnimationFrame(() => {
          const container = containerRef()
          const tooltip = tooltipRef()
          if (!container || !tooltip) return
          const rect = container.getBoundingClientRect()
          const tooltipRect = tooltip.getBoundingClientRect()
          const gap = 8
          const viewportWidth = window.innerWidth
          const viewportHeight = window.innerHeight
          const side = local.side ?? "top"

          let left: number
          let top: number

          if (side === "right") {
            left = Math.min(rect.right + gap, viewportWidth - tooltipRect.width - gap)
            top = rect.top + rect.height / 2 - tooltipRect.height / 2
            top = Math.max(gap, Math.min(top, viewportHeight - tooltipRect.height - gap))
          } else if (side === "left") {
            left = Math.max(gap, rect.left - tooltipRect.width - gap)
            top = rect.top + rect.height / 2 - tooltipRect.height / 2
            top = Math.max(gap, Math.min(top, viewportHeight - tooltipRect.height - gap))
          } else {
            const rawLeft = rect.left + rect.width / 2 - tooltipRect.width / 2
            const maxLeft = viewportWidth - tooltipRect.width - gap
            left = Math.max(gap, Math.min(rawLeft, maxLeft))
            const aboveTop = rect.top - tooltipRect.height - gap
            const belowTop = rect.bottom + gap
            const maxTop = viewportHeight - tooltipRect.height - gap
            top =
              side === "bottom" || aboveTop < gap
                ? Math.min(Math.max(belowTop, gap), maxTop)
                : Math.min(aboveTop, maxTop)
          }

          setPosition({ left, top })
        })
      },
      { defer: true },
    ),
  )

  const handleMouseEnter = () => {
    setShow(true)
  }

  const handleMouseLeave = () => {
    setShow(false)
  }

  const containerClass = local.class ? `relative inline-flex ${local.class}` : "relative inline-flex"

  return (
    <div ref={setContainerRef} class={containerClass} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {local.children}
      {show() && (
        <div
          ref={setTooltipRef}
          class="pointer-events-none fixed z-50 max-w-xs rounded border border-border bg-surface-floating px-2 py-1 text-xs leading-tight text-text shadow-lg"
          style={{
            left: `${position().left}px`,
            top: `${position().top}px`,
            animation: "fadeIn 100ms ease-out",
          }}
        >
          {local.content}
        </div>
      )}
    </div>
  )
}
