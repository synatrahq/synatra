export function normalizeConfig(cfg: unknown, key?: string): unknown {
  if (cfg === null || cfg === undefined) return cfg
  if (typeof cfg !== "object") return cfg
  if (Array.isArray(cfg)) {
    return cfg.map((item) => normalizeConfig(item))
  }
  const obj = cfg as Record<string, unknown>
  const result: Record<string, unknown> = {}
  const sortedKeys = Object.keys(obj).sort()
  for (const k of sortedKeys) {
    const normalized = normalizeConfig(obj[k], k)
    if (normalized === undefined) continue
    if (typeof normalized === "object" && normalized !== null && !Array.isArray(normalized)) {
      if (Object.keys(normalized as object).length === 0) continue
    }
    result[k] = normalized
  }
  if (key === "$defs" && Object.keys(result).length === 0) return undefined
  return Object.keys(result).length === 0 ? undefined : result
}

export function serializeConfig(cfg: unknown): string {
  const normalized = normalizeConfig(cfg)
  return JSON.stringify(normalized ?? {})
}

export function normalizeInputSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const node = schema as Record<string, unknown>
    if (!node.type && !node.properties) {
      const entries = Object.entries(node)
      const simple = entries.every(([, v]) => v === "string" || v === "number" || v === "boolean")
      if (simple) {
        return {
          type: "object",
          properties: Object.fromEntries(entries.map(([k, v]) => [k, { type: v }])),
          required: entries.map(([k]) => k),
        }
      }
    }
    if (node.type === "object" || node.properties) {
      return {
        type: "object",
        properties: (node.properties as Record<string, unknown>) ?? {},
        required: (node.required as string[]) ?? [],
      }
    }
  }
  return { type: "object", properties: {}, required: [] }
}
