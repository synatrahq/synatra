import { createSignal, onMount, onCleanup, Show, For, type JSX } from "solid-js"
import { Portal } from "solid-js/web"

export type DropdownMenuItem =
  | {
      type: "item"
      label: string
      onClick: () => void
      variant?: "default" | "danger"
      icon?: JSX.Element
      disabled?: boolean
    }
  | { type: "separator" }

type DropdownMenuProps = {
  trigger: JSX.Element
  items: DropdownMenuItem[]
}

export function DropdownMenu(props: DropdownMenuProps) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ top: 0, left: 0 })
  let triggerRef: HTMLDivElement | undefined
  let menuRef: HTMLDivElement | undefined

  const handleTriggerClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (triggerRef) {
      const rect = triggerRef.getBoundingClientRect()
      const menuWidth = 160
      const wouldOverflow = rect.left + menuWidth > window.innerWidth - 8
      setPosition({
        top: rect.bottom + 4,
        left: wouldOverflow ? rect.right - menuWidth : rect.left,
      })
    }
    setOpen(!open())
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (
      open() &&
      menuRef &&
      !menuRef.contains(e.target as Node) &&
      triggerRef &&
      !triggerRef.contains(e.target as Node)
    ) {
      setOpen(false)
    }
  }

  const handleItemClick = (item: DropdownMenuItem) => {
    if (item.type === "item" && !item.disabled) {
      item.onClick()
      setOpen(false)
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside)
  })

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside)
  })

  return (
    <>
      <div ref={triggerRef} role="button" onClick={handleTriggerClick}>
        {props.trigger}
      </div>
      <Show when={open()}>
        <Portal>
          <div
            ref={menuRef}
            class="fixed z-50 min-w-40 rounded-md border border-border bg-surface-floating py-1 shadow-elevated"
            style={{
              top: `${position().top}px`,
              left: `${position().left}px`,
            }}
            role="menu"
          >
            <For each={props.items}>
              {(item) => (
                <Show when={item.type === "item"} fallback={<hr class="my-1 border-border" />}>
                  {item.type === "item" && (
                    <button
                      type="button"
                      role="menuitem"
                      class="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors"
                      classList={{
                        "text-text hover:bg-surface-muted": item.variant !== "danger" && !item.disabled,
                        "text-danger hover:bg-surface-muted": item.variant === "danger" && !item.disabled,
                        "text-text-muted cursor-not-allowed": item.disabled,
                      }}
                      onClick={() => handleItemClick(item)}
                      disabled={item.disabled}
                    >
                      <Show when={item.icon}>{item.icon}</Show>
                      {item.label}
                    </button>
                  )}
                </Show>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </>
  )
}
