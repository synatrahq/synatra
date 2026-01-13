import { parse as parseYaml } from "yaml"

export type ParamDef = {
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

type OpenAPISpec = {
  paths: Record<string, PathItem>
  components?: { schemas?: Record<string, Schema> }
}

type PathItem = {
  get?: Operation
  post?: Operation
  put?: Operation
  patch?: Operation
  delete?: Operation
  parameters?: Parameter[]
}

type Operation = {
  summary?: string
  description?: string
  operationId?: string
  parameters?: Parameter[]
  requestBody?: RequestBody
  responses?: Record<string, Response>
}

type Parameter = {
  name: string
  in: "path" | "query" | "header" | "cookie"
  description?: string
  required?: boolean
  schema?: Schema
  $ref?: string
}

type RequestBody = {
  description?: string
  required?: boolean
  content?: Record<string, { schema?: Schema }>
  $ref?: string
}

type Response = {
  description?: string
  content?: Record<string, { schema?: Schema; example?: unknown }>
  $ref?: string
}

type Schema = {
  type?: string
  format?: string
  description?: string
  properties?: Record<string, Schema>
  items?: Schema
  required?: string[]
  enum?: unknown[]
  $ref?: string
  anyOf?: Schema[]
  oneOf?: Schema[]
  allOf?: Schema[]
  example?: unknown
  default?: unknown
  nullable?: boolean
  "x-expandableFields"?: string[]
}

export async function fetchSpec(url: string, format: "json" | "yaml" = "json"): Promise<OpenAPISpec> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  const text = await response.text()
  return format === "yaml" ? parseYaml(text) : JSON.parse(text)
}

function resolveRef(ref: string, spec: OpenAPISpec): unknown {
  if (!ref.startsWith("#/")) return null
  const parts = ref.slice(2).split("/")
  let current: unknown = spec
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return null
    }
  }
  return current
}

function resolveSchema(schema: Schema | undefined, spec: OpenAPISpec, depth = 0): Schema | undefined {
  if (!schema) return undefined
  if (depth > 5) return schema
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, spec) as Schema | null
    return resolved ? resolveSchema(resolved, spec, depth + 1) : undefined
  }
  return schema
}

function convertType(schema: Schema | undefined): string {
  if (!schema) return "unknown"
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop()
    return name || "object"
  }
  if (schema.anyOf || schema.oneOf) return "object"
  if (schema.allOf) return "object"
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ")
  switch (schema.type) {
    case "string":
      return schema.format ? `string (${schema.format})` : "string"
    case "integer":
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    case "array":
      return schema.items ? `${convertType(schema.items)}[]` : "array"
    case "object":
      return "object"
    default:
      return schema.type || "unknown"
  }
}

function generateExample(schema: Schema | undefined, spec: OpenAPISpec, depth = 0): unknown {
  if (!schema || depth > 3) return null
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, spec) as Schema | null
    return resolved ? generateExample(resolved, spec, depth + 1) : null
  }
  if (schema.enum && schema.enum.length > 0) return schema.enum[0]
  if (schema.anyOf && schema.anyOf.length > 0) return generateExample(schema.anyOf[0], spec, depth + 1)
  if (schema.oneOf && schema.oneOf.length > 0) return generateExample(schema.oneOf[0], spec, depth + 1)

  switch (schema.type) {
    case "string":
      if (schema.format === "date-time") return "2024-01-01T00:00:00Z"
      if (schema.format === "date") return "2024-01-01"
      if (schema.format === "email") return "user@example.com"
      if (schema.format === "uri" || schema.format === "url") return "https://example.com"
      return "string"
    case "integer":
    case "number":
      return 0
    case "boolean":
      return true
    case "array":
      if (schema.items) {
        const item = generateExample(schema.items, spec, depth + 1)
        return item !== null ? [item] : []
      }
      return []
    case "object":
      if (schema.properties) {
        const obj: Record<string, unknown> = {}
        const props = Object.entries(schema.properties).slice(0, 8)
        for (const [key, propSchema] of props) {
          const val = generateExample(propSchema, spec, depth + 1)
          if (val !== null) obj[key] = val
        }
        return obj
      }
      return {}
    default:
      return null
  }
}

function extractParameters(
  operation: Operation,
  pathItem: PathItem,
  spec: OpenAPISpec,
): { path: Record<string, ParamDef>; query: Record<string, ParamDef> } {
  const path: Record<string, ParamDef> = {}
  const query: Record<string, ParamDef> = {}

  const params = [...(pathItem.parameters || []), ...(operation.parameters || [])]

  for (const param of params) {
    let resolved = param
    if (param.$ref) {
      const ref = resolveRef(param.$ref, spec) as Parameter | null
      if (ref) resolved = ref
    }
    const schema = resolveSchema(resolved.schema, spec)
    const def: ParamDef = {
      type: convertType(schema),
      description: resolved.description || "",
      required: resolved.required,
    }
    if (resolved.in === "path") path[resolved.name] = def
    if (resolved.in === "query") query[resolved.name] = def
  }

  return { path, query }
}

function extractBodyParams(
  requestBody: RequestBody | undefined,
  spec: OpenAPISpec,
): Record<string, ParamDef> | undefined {
  if (!requestBody) return undefined
  let body = requestBody
  if (requestBody.$ref) {
    const resolved = resolveRef(requestBody.$ref, spec) as RequestBody | null
    if (resolved) body = resolved
  }
  const content = body.content?.["application/json"] || body.content?.["application/x-www-form-urlencoded"]
  if (!content?.schema) return undefined

  const schema = resolveSchema(content.schema, spec)
  if (!schema?.properties) return undefined

  const params: Record<string, ParamDef> = {}
  const required = new Set(schema.required || [])

  for (const [name, propSchema] of Object.entries(schema.properties)) {
    const resolved = resolveSchema(propSchema, spec)
    params[name] = {
      type: convertType(resolved),
      description: resolved?.description || "",
      required: required.has(name),
    }
  }
  return Object.keys(params).length > 0 ? params : undefined
}

function extractResponseExample(operation: Operation, spec: OpenAPISpec): unknown {
  const successResponse = operation.responses?.["200"] || operation.responses?.["201"]
  if (!successResponse) return {}

  let response = successResponse
  if (successResponse.$ref) {
    const resolved = resolveRef(successResponse.$ref, spec) as Response | null
    if (resolved) response = resolved
  }

  const content = response.content?.["application/json"]
  if (content?.example) return content.example
  if (content?.schema) {
    const schema = resolveSchema(content.schema, spec)
    return generateExample(schema, spec) ?? {}
  }
  return {}
}

export function parseEndpoint(path: string, method: string, spec: OpenAPISpec): EndpointDoc | null {
  const pathItem = spec.paths[path]
  if (!pathItem) return null

  const operation = pathItem[method.toLowerCase() as keyof PathItem] as Operation | undefined
  if (!operation) return null

  const { path: pathParams, query: queryParams } = extractParameters(operation, pathItem, spec)
  const bodyParams = extractBodyParams(operation.requestBody, spec)
  const responseExample = extractResponseExample(operation, spec)

  return {
    method: method.toUpperCase(),
    path,
    description: operation.summary || operation.description || "",
    pathParams: Object.keys(pathParams).length > 0 ? pathParams : undefined,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    bodyParams,
    responseExample,
  }
}

export function parseEndpoints(spec: OpenAPISpec, endpoints: Array<{ path: string; method: string }>): EndpointDoc[] {
  const results: EndpointDoc[] = []
  for (const { path, method } of endpoints) {
    const doc = parseEndpoint(path, method, spec)
    if (doc) results.push(doc)
    else console.warn(`Endpoint not found: ${method} ${path}`)
  }
  return results
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const

export function parseAllEndpoints(spec: OpenAPISpec): EndpointDoc[] {
  const results: EndpointDoc[] = []
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      if (pathItem[method]) {
        const doc = parseEndpoint(path, method.toUpperCase(), spec)
        if (doc) results.push(doc)
      }
    }
  }
  return results
}

export function splitEndpoints(endpoints: EndpointDoc[]): {
  index: EndpointIndex[]
  details: EndpointDetails[]
} {
  const index: EndpointIndex[] = []
  const details: EndpointDetails[] = []

  for (const ep of endpoints) {
    index.push({
      method: ep.method,
      path: ep.path,
      description: ep.description,
    })
    details.push({
      method: ep.method,
      path: ep.path,
      pathParams: ep.pathParams,
      queryParams: ep.queryParams,
      bodyParams: ep.bodyParams,
      responseExample: ep.responseExample,
    })
  }

  return { index, details }
}
