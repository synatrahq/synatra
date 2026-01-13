import Ajv from "ajv"

const ajv = new Ajv({ allErrors: true, strict: false })

export type Result = { valid: true } | { valid: false; errors: string[] }

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
