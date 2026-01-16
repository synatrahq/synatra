import Ajv from "ajv"

const ajv = new Ajv({ allErrors: true, strict: false })

export type Result = { valid: true } | { valid: false; errors: string[] }

export const ValidJsonSchemaTypes = ["string", "number", "integer", "boolean", "null", "object", "array"] as const
export type ValidJsonSchemaType = (typeof ValidJsonSchemaTypes)[number]

export type JsonSchemaValidationResult = { valid: true } | { valid: false; path: string; invalidType: string }

export function validateJsonSchemaTypes(schema: unknown, path: string = ""): JsonSchemaValidationResult {
  if (!schema || typeof schema !== "object") {
    return { valid: true }
  }

  if (Array.isArray(schema)) {
    for (let i = 0; i < schema.length; i++) {
      const result = validateJsonSchemaTypes(schema[i], path ? `${path}[${i}]` : `[${i}]`)
      if (!result.valid) return result
    }
    return { valid: true }
  }

  const obj = schema as Record<string, unknown>

  if ("type" in obj) {
    if (typeof obj.type === "string") {
      if (!ValidJsonSchemaTypes.includes(obj.type as ValidJsonSchemaType)) {
        return { valid: false, path: path || "root", invalidType: obj.type }
      }
    } else if (Array.isArray(obj.type)) {
      for (const t of obj.type) {
        if (typeof t === "string" && !ValidJsonSchemaTypes.includes(t as ValidJsonSchemaType)) {
          return { valid: false, path: path || "root", invalidType: t }
        }
      }
    }
  }

  if ("properties" in obj && typeof obj.properties === "object" && obj.properties !== null) {
    for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
      const result = validateJsonSchemaTypes(value, path ? `${path}.properties.${key}` : `properties.${key}`)
      if (!result.valid) return result
    }
  }

  if ("items" in obj && typeof obj.items === "object" && obj.items !== null) {
    const result = validateJsonSchemaTypes(obj.items, path ? `${path}.items` : "items")
    if (!result.valid) return result
  }

  if (
    "additionalProperties" in obj &&
    typeof obj.additionalProperties === "object" &&
    obj.additionalProperties !== null
  ) {
    const result = validateJsonSchemaTypes(
      obj.additionalProperties,
      path ? `${path}.additionalProperties` : "additionalProperties",
    )
    if (!result.valid) return result
  }

  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    if (keyword in obj && Array.isArray(obj[keyword])) {
      for (let i = 0; i < obj[keyword].length; i++) {
        const result = validateJsonSchemaTypes(obj[keyword][i], path ? `${path}.${keyword}[${i}]` : `${keyword}[${i}]`)
        if (!result.valid) return result
      }
    }
  }

  for (const keyword of ["$defs", "definitions"] as const) {
    if (keyword in obj && typeof obj[keyword] === "object" && obj[keyword] !== null) {
      for (const [key, value] of Object.entries(obj[keyword] as Record<string, unknown>)) {
        const result = validateJsonSchemaTypes(value, path ? `${path}.${keyword}.${key}` : `${keyword}.${key}`)
        if (!result.valid) return result
      }
    }
  }

  if ("not" in obj && typeof obj.not === "object" && obj.not !== null) {
    const result = validateJsonSchemaTypes(obj.not, path ? `${path}.not` : "not")
    if (!result.valid) return result
  }

  if ("if" in obj && typeof obj.if === "object" && obj.if !== null) {
    const result = validateJsonSchemaTypes(obj.if, path ? `${path}.if` : "if")
    if (!result.valid) return result
  }
  if ("then" in obj && typeof obj.then === "object" && obj.then !== null) {
    const result = validateJsonSchemaTypes(obj.then, path ? `${path}.then` : "then")
    if (!result.valid) return result
  }
  if ("else" in obj && typeof obj.else === "object" && obj.else !== null) {
    const result = validateJsonSchemaTypes(obj.else, path ? `${path}.else` : "else")
    if (!result.valid) return result
  }

  return { valid: true }
}

export function validatePayload(data: unknown, schema: unknown): Result {
  if (!schema || typeof schema !== "object") {
    return { valid: true }
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
