import { createSignal, createEffect, onCleanup, For, Show, createMemo } from "solid-js"
import { Portal } from "solid-js/web"
import type { AgentStatus } from "../../../components"

import slimeImg from "../../../assets/images/loading-slime.png"
import robotImg from "../../../assets/images/loading-robot.png"
import catImg from "../../../assets/images/loading-cat.png"
import ghostImg from "../../../assets/images/loading-ghost.png"
import dragonImg from "../../../assets/images/loading-dragon.png"
import foxImg from "../../../assets/images/loading-fox.png"
import mushroomImg from "../../../assets/images/loading-mushroom.png"
import penguinImg from "../../../assets/images/loading-penguin.png"
import ninjaImg from "../../../assets/images/loading-ninja.png"

const characters = [slimeImg, robotImg, catImg, ghostImg, dragonImg, foxImg, mushroomImg, penguinImg, ninjaImg]

const STORAGE_KEY = "synatra:loading-character"

function getStoredCharacter(): number {
  if (typeof window === "undefined") return 0
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return 0
  const index = parseInt(stored, 10)
  return isNaN(index) || index < 0 || index >= characters.length ? 0 : index
}

function setStoredCharacter(index: number) {
  localStorage.setItem(STORAGE_KEY, String(index))
}

const [selectedCharacterIndex, setSelectedCharacterIndex] = createSignal(getStoredCharacter())

export function getSelectedCharacter(): string {
  return characters[selectedCharacterIndex()]
}

function getStatusMessage(status: AgentStatus): string {
  if (!status) return "Working on it"
  switch (status.type) {
    case "thinking":
      return "Working on it"
    case "running_tool":
      return `Running ${status.toolName}`
    case "waiting_subagent":
      return `Delegating to ${status.subagentName}`
    case "processing":
      return "Processing"
    default:
      return "Working on it"
  }
}

type CharacterPickerProps = {
  size: number
  class?: string
}

function CharacterPicker(props: CharacterPickerProps) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ top: 0, left: 0 })
  let triggerRef: HTMLButtonElement | undefined

  const updatePosition = () => {
    if (!triggerRef) return
    const rect = triggerRef.getBoundingClientRect()
    setPosition({ top: rect.bottom + 4, left: rect.left })
  }

  createEffect(() => {
    if (!open()) return
    updatePosition()
    const handleClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) return setOpen(false)
      if (target.closest("[data-character-picker]")) return
      setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKeyDown)
    onCleanup(() => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
    })
  })

  const handleSelect = (index: number) => {
    setSelectedCharacterIndex(index)
    setStoredCharacter(index)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class={`cursor-pointer hover:scale-110 transition-transform ${props.class ?? ""}`}
        onClick={() => setOpen((v) => !v)}
        data-character-picker
        title="Click to change character"
      >
        <img src={getSelectedCharacter()} alt="" width={props.size} height={props.size} class="working-character" />
      </button>
      <Show when={open()}>
        <Portal>
          <div
            class="fixed z-[1100] rounded-lg border border-border bg-surface-floating p-2 shadow-lg"
            style={{ top: `${position().top}px`, left: `${position().left}px` }}
            data-character-picker
          >
            <div class="grid grid-cols-5 gap-1">
              <For each={characters}>
                {(char, index) => (
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-surface-muted"
                    classList={{ "bg-surface-muted ring-1 ring-accent": selectedCharacterIndex() === index() }}
                    onClick={() => handleSelect(index())}
                  >
                    <img src={char} alt="" width={24} height={24} style={{ "image-rendering": "pixelated" }} />
                  </button>
                )}
              </For>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}

type WorkingIndicatorProps = {
  status: AgentStatus
  threadId?: string
}

export function WorkingIndicator(props: WorkingIndicatorProps) {
  const message = createMemo(() => getStatusMessage(props.status))

  return (
    <div class="flex items-center gap-1.5 py-1">
      <style>{`
        @keyframes character-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes dot-blink {
          0%, 20% { opacity: 0.3; }
          40%, 100% { opacity: 1; }
        }
        .working-character {
          animation: character-float 1.2s ease-in-out infinite;
          image-rendering: pixelated;
        }
        .working-dot:nth-child(1) { animation: dot-blink 1.4s ease-in-out infinite; }
        .working-dot:nth-child(2) { animation: dot-blink 1.4s ease-in-out 0.2s infinite; }
        .working-dot:nth-child(3) { animation: dot-blink 1.4s ease-in-out 0.4s infinite; }
      `}</style>
      <CharacterPicker size={20} />
      <div class="flex items-center text-xs text-text-muted">
        <span>{message()}</span>
        <span class="working-dot">.</span>
        <span class="working-dot">.</span>
        <span class="working-dot">.</span>
      </div>
    </div>
  )
}

export function FullScreenWorking() {
  return (
    <div class="flex flex-col items-center gap-3">
      <style>{`
        @keyframes character-float-lg {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes dot-blink-lg {
          0%, 20% { opacity: 0.3; }
          40%, 100% { opacity: 1; }
        }
        .working-character-lg {
          animation: character-float-lg 1.2s ease-in-out infinite;
          image-rendering: pixelated;
        }
        .working-dot-lg:nth-child(1) { animation: dot-blink-lg 1.4s ease-in-out infinite; }
        .working-dot-lg:nth-child(2) { animation: dot-blink-lg 1.4s ease-in-out 0.2s infinite; }
        .working-dot-lg:nth-child(3) { animation: dot-blink-lg 1.4s ease-in-out 0.4s infinite; }
      `}</style>
      <CharacterPicker size={32} class="working-character-lg" />
      <div class="flex items-center text-xs text-text-muted font-medium">
        <span>Loading</span>
        <span class="working-dot-lg">.</span>
        <span class="working-dot-lg">.</span>
        <span class="working-dot-lg">.</span>
      </div>
    </div>
  )
}
