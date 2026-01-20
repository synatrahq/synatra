import { createMemo } from "solid-js"
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

export function getCharacterForThread(threadId?: string): string {
  if (!threadId) return characters[0]
  let hash = 0
  for (let i = 0; i < threadId.length; i++) {
    hash = (hash << 5) - hash + threadId.charCodeAt(i)
    hash |= 0
  }
  return characters[Math.abs(hash) % characters.length]
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

type WorkingIndicatorProps = {
  status: AgentStatus
  threadId?: string
}

export function WorkingIndicator(props: WorkingIndicatorProps) {
  const characterImg = createMemo(() => getCharacterForThread(props.threadId))
  const message = createMemo(() => getStatusMessage(props.status))

  return (
    <div class="flex items-center gap-2 py-1">
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
      <img src={characterImg()} alt="" width={20} height={20} class="working-character" />
      <div class="flex items-center text-xs text-text-muted">
        <span>{message()}</span>
        <span class="working-dot">.</span>
        <span class="working-dot">.</span>
        <span class="working-dot">.</span>
      </div>
    </div>
  )
}

type FullScreenWorkingProps = {
  threadId?: string
}

export function FullScreenWorking(props: FullScreenWorkingProps) {
  const characterImg = createMemo(() => getCharacterForThread(props.threadId))

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
      <img src={characterImg()} alt="" width={32} height={32} class="working-character-lg" />
      <div class="flex items-center text-xs text-text-muted font-medium">
        <span>Loading</span>
        <span class="working-dot-lg">.</span>
        <span class="working-dot-lg">.</span>
        <span class="working-dot-lg">.</span>
      </div>
    </div>
  )
}
