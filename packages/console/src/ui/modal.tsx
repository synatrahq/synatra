import { Show, createEffect, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import type { JSX } from "solid-js"
import { X, CaretLeft } from "phosphor-solid-js"

type ModalProps = {
  open: boolean
  children: JSX.Element
  onBackdropClick?: () => void
  onEscape?: () => void
  containerClass?: string
  contentClass?: string
}

export function Modal(props: ModalProps) {
  const contentClass = props.contentClass ?? "w-full"

  createEffect(() => {
    if (!props.open) return
    if (!props.onEscape) return
    if (typeof window === "undefined") return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      props.onEscape?.()
    }
    window.addEventListener("keydown", handler)
    onCleanup(() => {
      window.removeEventListener("keydown", handler)
    })
  })

  return (
    <Show when={props.open}>
      <Portal>
        <div class={`fixed inset-0 z-50 flex items-center justify-center ${props.containerClass ?? ""}`.trim()}>
          <div
            class="absolute inset-0 bg-surface opacity-80"
            onClick={() => {
              if (props.onBackdropClick) props.onBackdropClick()
            }}
          />
          <div class={`pointer-events-none relative z-10 ${contentClass}`.trim()}>{props.children}</div>
        </div>
      </Portal>
    </Show>
  )
}

// Modal Container - standard modal wrapper with border, bg, shadow
type ModalContainerProps = {
  children: JSX.Element
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl"
}

export function ModalContainer(props: ModalContainerProps) {
  const sizeClass = () => {
    switch (props.size) {
      case "sm":
        return "max-w-sm"
      case "lg":
        return "max-w-lg"
      case "xl":
        return "max-w-xl"
      case "2xl":
        return "max-w-2xl"
      case "3xl":
        return "max-w-3xl"
      case "4xl":
        return "max-w-4xl"
      default:
        return "max-w-md"
    }
  }

  return (
    <div
      class={`pointer-events-auto flex w-full ${sizeClass()} mx-auto flex-col rounded-lg border border-border bg-surface shadow-elevated`}
    >
      {props.children}
    </div>
  )
}

// Modal Header
type ModalHeaderProps = {
  title: string
  onClose: () => void
  onBack?: () => void
}

export function ModalHeader(props: ModalHeaderProps) {
  return (
    <div class="flex items-center justify-between border-b border-border px-3 py-2">
      <div class="flex items-center gap-2">
        <Show when={props.onBack}>
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            onClick={props.onBack}
          >
            <CaretLeft class="h-3.5 w-3.5" />
          </button>
        </Show>
        <span class="text-xs font-medium text-text">{props.title}</span>
      </div>
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        onClick={props.onClose}
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// Modal Body
type ModalBodyProps = {
  children: JSX.Element
  class?: string
}

export function ModalBody(props: ModalBodyProps) {
  return <div class={`flex flex-col gap-2 p-2 ${props.class ?? ""}`.trim()}>{props.children}</div>
}

// Modal Footer
type ModalFooterProps = {
  children: JSX.Element
}

export function ModalFooter(props: ModalFooterProps) {
  return <div class="flex items-center justify-end gap-2 border-t border-border px-3 py-2">{props.children}</div>
}
