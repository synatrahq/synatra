import { getPayloadSchemaForEvents } from "@synatra/core/types/app-payload"

export type ValidationStatus = "success" | "error" | "missing-schema"
export type ValidationHighlight = { from: number; to: number; status: "ok" | "error"; message?: string }

export function generateSampleFromSchema(schema: Record<string, unknown>): unknown {
  const type = schema.type as string | undefined
  if (type === "string") return "example"
  if (type === "number" || type === "integer") return 0
  if (type === "boolean") return true
  if (type === "array") {
    const items = schema.items as Record<string, unknown> | undefined
    if (items) return [generateSampleFromSchema(items)]
    return []
  }
  if (type === "object" || schema.properties) {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
    if (!properties || Object.keys(properties).length === 0) return {}
    const sample: Record<string, unknown> = {}
    for (const [key, prop] of Object.entries(properties)) {
      sample[key] = generateSampleFromSchema(prop)
    }
    return sample
  }
  return null
}

export function generateSamplePayload(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "{}"
  const sample = generateSampleFromSchema(schema as Record<string, unknown>)
  return JSON.stringify(sample)
}

export function ensureObjectSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const s = schema as Record<string, unknown>
    if (s.type === "object" || s.properties) {
      return s
    }
  }
  return { type: "object", properties: {} }
}

function splitPath(path: string): (string | number)[] {
  const tokens = path.match(/[^.[\]]+/g) ?? []
  return tokens.map((t) => {
    const n = Number(t)
    if (!Number.isNaN(n) && t.trim() !== "") return n
    return t
  })
}

function pathExists(schema: Record<string, unknown>, path: string): boolean {
  const segments = splitPath(path)
  let current: Record<string, unknown> | null = schema
  for (const segment of segments) {
    if (!current) return false
    const type = current.type as string | undefined
    if (type === "object" || current.properties) {
      const props = (current.properties as Record<string, unknown>) ?? {}
      if (typeof segment !== "string") return false
      const next = props[segment]
      if (!next || typeof next !== "object") return false
      current = next as Record<string, unknown>
      continue
    }
    if (type === "array" || current.items) {
      const items = current.items as Record<string, unknown> | undefined
      if (typeof segment !== "number" || !items) return false
      current = items
      continue
    }
    return false
  }
  return true
}

export function validateTemplate(
  content: string,
  schema: Record<string, unknown>,
): { summary: { status: ValidationStatus; message: string } | null; highlights: ValidationHighlight[] } {
  const highlights: ValidationHighlight[] = []
  if (!content) return { summary: null, highlights }

  const matches = [...content.matchAll(/{{\s*([^}]+)\s*}}/g)]
  if (matches.length === 0) return { summary: { status: "success", message: "No placeholders" }, highlights }

  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    for (const match of matches) {
      const from = match.index ?? 0
      const to = from + match[0].length
      highlights.push({ from, to, status: "error", message: "Define payload schema" })
    }
    return { summary: { status: "missing-schema", message: "Add payload schema" }, highlights }
  }

  let errors = 0
  for (const match of matches) {
    const expr = match[1]?.trim() ?? ""
    const from = match.index ?? 0
    const to = from + match[0].length
    if (!expr) {
      errors += 1
      highlights.push({ from, to, status: "error", message: "Empty placeholder" })
      continue
    }
    const ok = pathExists(schema, expr)
    if (!ok) {
      errors += 1
      highlights.push({ from, to, status: "error", message: `Not in schema: ${expr}` })
      continue
    }
    highlights.push({ from, to, status: "ok" })
  }

  if (errors > 0) {
    return {
      summary: { status: "error", message: `${errors} invalid placeholder${errors > 1 ? "s" : ""}` },
      highlights,
    }
  }

  return { summary: { status: "success", message: "All placeholders valid" }, highlights }
}

export function getAppPayloadSchema(
  appId: string | null | undefined,
  events: string[],
): Record<string, unknown> | null {
  if (!appId || events.length === 0) return null
  return getPayloadSchemaForEvents(appId, events)
}

export function generatePlaceholdersFromSchema(schema: Record<string, unknown>, prefix = ""): string[] {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
  if (!properties) return []
  const placeholders: string[] = []
  for (const [key, prop] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (prop.type === "object" && prop.properties) {
      placeholders.push(...generatePlaceholdersFromSchema(prop, path))
    } else {
      placeholders.push(`{{ ${path} }}`)
    }
  }
  return placeholders
}
