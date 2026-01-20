import { createSignal, createEffect } from "solid-js"

export function createPersistedSignal<T>(key: string, parse: (raw: string) => T | null) {
  const [value, setValue] = createSignal<T>(null as T)

  function read(): T | null {
    if (typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? parse(raw) : null
    } catch {
      return null
    }
  }

  function init(defaultValue: T | (() => T)) {
    const stored = read()
    const initial = stored ?? (typeof defaultValue === "function" ? (defaultValue as () => T)() : defaultValue)
    setValue(() => initial)

    createEffect(() => {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(key, String(value()))
        } catch {
          // Storage unavailable
        }
      }
    })
  }

  return [value, setValue, init] as const
}
