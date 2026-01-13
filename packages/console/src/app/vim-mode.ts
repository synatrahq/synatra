import { createPersistedSignal } from "./persisted-signal"

export const [vimMode, setVimMode, initStorage] = createPersistedSignal("synatra:vimMode", (raw) =>
  raw === "true" ? true : raw === "false" ? false : null,
)

export function initVimMode() {
  initStorage(false)
}

export function toggleVimMode() {
  setVimMode(!vimMode())
}
