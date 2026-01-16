import Ajv2020 from "ajv/dist/2020"

const ajv = new Ajv2020({ allErrors: true, strict: false, validateSchema: true })

export type Result = { valid: true } | { valid: false; errors: string[] }

export const ValidJsonSchemaTypes = ["string", "number", "integer", "boolean", "null", "object", "array"] as const
export type ValidJsonSchemaType = (typeof ValidJsonSchemaTypes)[number]

export const JsonSchemaProvider = ["openai", "google", "anthropic"] as const
export type JsonSchemaProvider = (typeof JsonSchemaProvider)[number]

const OpenAiDisallowedKeywords = new Set([
  "unevaluatedProperties",
  "unevaluatedItems",
  "contains",
  "minContains",
  "maxContains",
  "propertyNames",
  "patternProperties",
  "dependentSchemas",
  "dependentRequired",
  "prefixItems",
  "$dynamicRef",
  "$dynamicAnchor",
  "$vocabulary",
  "contentMediaType",
  "contentEncoding",
  "contentSchema",
])

const GoogleDisallowedKeywords = new Set([
  "unevaluatedProperties",
  "unevaluatedItems",
  "contains",
  "minContains",
  "maxContains",
  "propertyNames",
  "patternProperties",
  "dependentSchemas",
  "dependentRequired",
  "$dynamicRef",
  "$dynamicAnchor",
  "$vocabulary",
  "contentMediaType",
  "contentEncoding",
  "contentSchema",
])

const SchemaKeywordContainers = [
  "properties",
  "items",
  "additionalProperties",
  "allOf",
  "anyOf",
  "oneOf",
  "$defs",
  "definitions",
  "not",
  "if",
  "then",
  "else",
  "prefixItems",
  "dependentSchemas",
  "patternProperties",
  "contains",
  "propertyNames",
  "unevaluatedProperties",
  "unevaluatedItems",
] as const

function collectProviderSchemaErrors(
  schema: unknown,
  path: string,
  disallowedKeywords: Set<string>,
  errors: string[],
  provider: JsonSchemaProvider,
): void {
  if (!schema || typeof schema !== "object") {
    return
  }

  if (Array.isArray(schema)) {
    for (let i = 0; i < schema.length; i++) {
      collectProviderSchemaErrors(schema[i], path ? `${path}[${i}]` : `[${i}]`, disallowedKeywords, errors, provider)
    }
    return
  }

  const obj = schema as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (disallowedKeywords.has(key)) {
      const keyPath = path ? `${path}.${key}` : key
      errors.push(`${keyPath}: keyword "${key}" is not supported by ${provider}`)
    }
  }

  for (const keyword of SchemaKeywordContainers) {
    if (!(keyword in obj)) {
      continue
    }

    const value = obj[keyword]
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          collectProviderSchemaErrors(
            value[i],
            path ? `${path}.${keyword}[${i}]` : `${keyword}[${i}]`,
            disallowedKeywords,
            errors,
            provider,
          )
        }
        continue
      }

      if (
        keyword === "properties" ||
        keyword === "$defs" ||
        keyword === "definitions" ||
        keyword === "patternProperties"
      ) {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          collectProviderSchemaErrors(
            nested,
            path ? `${path}.${keyword}.${key}` : `${keyword}.${key}`,
            disallowedKeywords,
            errors,
            provider,
          )
        }
        continue
      }

      collectProviderSchemaErrors(value, path ? `${path}.${keyword}` : keyword, disallowedKeywords, errors, provider)
    }
  }
}

export function validateJsonSchema(schema: unknown): Result {
  if (!schema || typeof schema !== "object") {
    return { valid: true }
  }

  const valid = ajv.validateSchema(schema)
  if (valid) {
    return { valid: true }
  }

  const errors = (ajv.errors ?? []).map((e) => {
    const path = e.instancePath || "root"
    return `${path}: ${e.message ?? "invalid schema"}`
  })

  return { valid: false, errors }
}

export function validateJsonSchemaForProvider(schema: unknown, provider: JsonSchemaProvider): Result {
  if (!schema || typeof schema !== "object") {
    return { valid: true }
  }

  if (provider === "openai") {
    const errors: string[] = []
    collectProviderSchemaErrors(schema, "", OpenAiDisallowedKeywords, errors, provider)
    return errors.length ? { valid: false, errors } : { valid: true }
  }

  if (provider === "google") {
    const errors: string[] = []
    collectProviderSchemaErrors(schema, "", GoogleDisallowedKeywords, errors, provider)
    return errors.length ? { valid: false, errors } : { valid: true }
  }

  return { valid: true }
}

export function validatePayload(data: unknown, schema: unknown): Result {
  if (!schema || typeof schema !== "object") {
    return { valid: true }
  }

  const schemaValidation = validateJsonSchema(schema)
  if (!schemaValidation.valid) {
    return schemaValidation
  }

  const validate = ajv.compile(schema as object)
  const valid = validate(data)

  if (valid) {
    return { valid: true }
  }

  const errors = (validate.errors ?? []).map((e) => {
    const path = e.instancePath || "root"
    return `${path}: ${e.message}`
  })

  return { valid: false, errors }
}
