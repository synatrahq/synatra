export function renderTemplate(template: string, payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload must be an object")
  }

  const resolve = (path: string): unknown => {
    const keys = path.split(".")
    let current: unknown = payload
    for (const key of keys) {
      if (!current || typeof current !== "object") return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  const replace = (_: string, expr: string): string => {
    const path = expr.trim()
    if (!path) throw new Error("Empty placeholder")

    const value = resolve(path)
    if (value === undefined) throw new Error(`Missing value for "${path}"`)
    if (value === null) return "null"
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  return template.replace(/{{\s*([^}]+)\s*}}/g, replace)
}

export function tryRenderTemplate(
  template: string,
  payload: Record<string, unknown>,
): { ok: true; result: string } | { ok: false; error: string } {
  try {
    const result = renderTemplate(template, payload)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to render template" }
  }
}

export function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/{{\s*([^}]+)\s*}}/g)
  return [...matches].map((m) => m[1].trim())
}
