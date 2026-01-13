import { createEffect } from "solid-js"
import { createPersistedSignal } from "./persisted-signal"

type Theme = "light" | "dark"

export const [theme, setTheme, initStorage] = createPersistedSignal<Theme>("synatra:theme", (raw) =>
  raw === "light" || raw === "dark" ? raw : null,
)

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function apply(value: Theme) {
  if (typeof document === "undefined") return
  document.documentElement.dataset.theme = value
}

export function initTheme() {
  initStorage(systemTheme)
  createEffect(() => apply(theme()))
}

export function toggleTheme() {
  setTheme(theme() === "light" ? "dark" : "light")
}
