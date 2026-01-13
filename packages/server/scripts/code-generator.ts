import type { EndpointDoc, EndpointIndex, EndpointDetails } from "./openapi-parser"

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

function formatValue(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent)
  const padInner = "  ".repeat(indent + 1)

  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return `"${escapeString(value)}"`
  if (typeof value === "number" || typeof value === "boolean") return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    const items = value.map((v) => formatValue(v, indent + 1))
    if (items.join(", ").length < 60 && !items.some((i) => i.includes("\n"))) {
      return `[${items.join(", ")}]`
    }
    return `[\n${padInner}${items.join(`,\n${padInner}`)},\n${pad}]`
  }

  if (typeof value === "object") {
    const entries = Object.entries(value)
    if (entries.length === 0) return "{}"
    const formatted = entries.map(([k, v]) => {
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `"${escapeString(k)}"`
      return `${key}: ${formatValue(v, indent + 1)}`
    })
    if (formatted.join(", ").length < 60 && !formatted.some((f) => f.includes("\n"))) {
      return `{ ${formatted.join(", ")} }`
    }
    return `{\n${padInner}${formatted.join(`,\n${padInner}`)},\n${pad}}`
  }

  return String(value)
}

function formatParamDef(
  params: Record<string, { type: string; description: string; required?: boolean }>,
  indent: number,
): string {
  const pad = "  ".repeat(indent)
  const padInner = "  ".repeat(indent + 1)
  const entries = Object.entries(params)

  const formatted = entries.map(([name, def]) => {
    const parts = [`type: "${escapeString(def.type)}"`, `description: "${escapeString(def.description)}"`]
    if (def.required) parts.push("required: true")
    return `${name}: { ${parts.join(", ")} }`
  })

  return `{\n${padInner}${formatted.join(`,\n${padInner}`)},\n${pad}}`
}

function formatEndpoint(endpoint: EndpointDoc, indent: number): string {
  const pad = "  ".repeat(indent)
  const padInner = "  ".repeat(indent + 1)

  const lines: string[] = [
    `method: "${endpoint.method}"`,
    `path: "${escapeString(endpoint.path)}"`,
    `description: "${escapeString(endpoint.description)}"`,
  ]

  if (endpoint.pathParams) {
    lines.push(`pathParams: ${formatParamDef(endpoint.pathParams, indent + 1)}`)
  }
  if (endpoint.queryParams) {
    lines.push(`queryParams: ${formatParamDef(endpoint.queryParams, indent + 1)}`)
  }
  if (endpoint.bodyParams) {
    lines.push(`bodyParams: ${formatParamDef(endpoint.bodyParams, indent + 1)}`)
  }
  lines.push(`responseExample: ${formatValue(endpoint.responseExample, indent + 1)}`)

  return `{\n${padInner}${lines.join(`,\n${padInner}`)},\n${pad}}`
}

export function generateCode(apiDocs: Record<string, { summary: string; endpoints: EndpointDoc[] }>): string {
  const timestamp = new Date().toISOString()

  const typeDefinitions = `export type ParamDef = {
  type: string
  description: string
  required?: boolean
}

export type EndpointDoc = {
  method: string
  path: string
  description: string
  pathParams?: Record<string, ParamDef>
  queryParams?: Record<string, ParamDef>
  bodyParams?: Record<string, ParamDef>
  responseExample: unknown
}`

  const summariesEntries = Object.entries(apiDocs)
    .map(([key, { summary }]) => `  ${key}: \`${summary}\``)
    .join(",\n\n")
  const summaries = `export const API_SUMMARIES: Record<string, string> = {\n${summariesEntries},\n}`

  const endpointsEntries = Object.entries(apiDocs)
    .map(([key, { endpoints }]) => {
      const formatted = endpoints.map((e) => formatEndpoint(e, 2)).join(",\n    ")
      return `  ${key}: [\n    ${formatted},\n  ]`
    })
    .join(",\n\n")
  const endpointsCode = `export const API_ENDPOINTS: Record<string, EndpointDoc[]> = {\n${endpointsEntries},\n}`

  const helperFunctions = `export function searchEndpoints(type: string, query: string): EndpointDoc[] {
  const endpoints = API_ENDPOINTS[type] ?? []
  const q = query.toLowerCase()
  return endpoints
    .filter((e) => e.path.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
    .slice(0, 5)
}

export function formatEndpointForLLM(endpoint: EndpointDoc): string {
  const parts: string[] = [\`\${endpoint.method} \${endpoint.path}\`, endpoint.description]

  if (endpoint.pathParams) {
    parts.push("\\nPath Parameters:")
    for (const [name, def] of Object.entries(endpoint.pathParams)) {
      parts.push(\`  \${name}: \${def.type} - \${def.description}\${def.required ? " (required)" : ""}\`)
    }
  }

  if (endpoint.queryParams) {
    parts.push("\\nQuery Parameters:")
    for (const [name, def] of Object.entries(endpoint.queryParams)) {
      parts.push(\`  \${name}: \${def.type} - \${def.description}\${def.required ? " (required)" : ""}\`)
    }
  }

  if (endpoint.bodyParams) {
    parts.push("\\nBody Parameters:")
    for (const [name, def] of Object.entries(endpoint.bodyParams)) {
      parts.push(\`  \${name}: \${def.type} - \${def.description}\${def.required ? " (required)" : ""}\`)
    }
  }

  parts.push("\\nResponse Example:")
  parts.push(JSON.stringify(endpoint.responseExample, null, 2))

  return parts.join("\\n")
}

export function formatEndpointsForLLM(endpoints: EndpointDoc[]): string {
  return endpoints.map(formatEndpointForLLM).join("\\n\\n---\\n\\n")
}

export function formatIndexForLLM(index: EndpointIndex[]): string {
  return index.map((e, i) => \`\${i + 1}. \${e.method} \${e.path} - \${e.description}\`).join("\\n")
}`

  return `/**
 * Auto-generated API documentation for Copilot
 * Generated: ${timestamp}
 *
 * DO NOT EDIT THIS FILE DIRECTLY
 * Run \`pnpm --filter @synatra/server generate:api-docs\` to regenerate
 *
 * Configuration: scripts/api-docs-config.json
 * Generator: scripts/generate-api-docs.ts
 */

${typeDefinitions}

${summaries}

${endpointsCode}

${helperFunctions}
`
}

export function generateIndexJson(data: Record<string, EndpointIndex[]>): string {
  return JSON.stringify(data, null, 2)
}

export function generateDetailsJson(data: Record<string, EndpointDetails[]>): string {
  return JSON.stringify(data, null, 2)
}

export function generateApiDocsModule(): string {
  const timestamp = new Date().toISOString()

  return `/**
 * Auto-generated API documentation types and utilities
 * Generated: ${timestamp}
 *
 * DO NOT EDIT THIS FILE DIRECTLY
 * Run \`pnpm --filter @synatra/server generate:api-docs\` to regenerate
 */

import indexData from "./api-docs-index.json"
import detailsData from "./api-docs-details.json"

export type ParamDef = {
  type: string
  description: string
  required?: boolean
}

export type EndpointIndex = {
  method: string
  path: string
  description: string
}

export type EndpointDetails = {
  method: string
  path: string
  pathParams?: Record<string, ParamDef>
  queryParams?: Record<string, ParamDef>
  bodyParams?: Record<string, ParamDef>
  responseExample: unknown
}

export type EndpointDoc = EndpointIndex & Omit<EndpointDetails, "method" | "path">

export const API_INDEX = indexData as Record<string, EndpointIndex[]>
export const API_DETAILS = detailsData as Record<string, EndpointDetails[]>

export function getIndex(type: string): EndpointIndex[] {
  return API_INDEX[type] ?? []
}

export function getDetails(type: string, method: string, path: string): EndpointDetails | null {
  const details = API_DETAILS[type] ?? []
  return details.find((d) => d.method === method && d.path === path) ?? null
}

export function formatIndexForLLM(index: EndpointIndex[]): string {
  return index.map((e, i) => \`\${i + 1}. \${e.method} \${e.path} - \${e.description}\`).join("\\n")
}

export function formatDetailsForLLM(details: EndpointDetails): string {
  const parts: string[] = [\`\${details.method} \${details.path}\`]

  if (details.pathParams) {
    parts.push("\\nPath Parameters:")
    for (const [name, def] of Object.entries(details.pathParams)) {
      parts.push(\`  \${name}: \${def.type} - \${def.description}\${def.required ? " (required)" : ""}\`)
    }
  }

  if (details.queryParams) {
    parts.push("\\nQuery Parameters:")
    for (const [name, def] of Object.entries(details.queryParams)) {
      parts.push(\`  \${name}: \${def.type} - \${def.description}\${def.required ? " (required)" : ""}\`)
    }
  }

  if (details.bodyParams) {
    parts.push("\\nBody Parameters:")
    for (const [name, def] of Object.entries(details.bodyParams)) {
      parts.push(\`  \${name}: \${def.type} - \${def.description}\${def.required ? " (required)" : ""}\`)
    }
  }

  parts.push("\\nResponse Example:")
  parts.push(JSON.stringify(details.responseExample, null, 2))

  return parts.join("\\n")
}
`
}
