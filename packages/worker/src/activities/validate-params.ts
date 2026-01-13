import Ajv from "ajv"

export interface ValidateParamsInput {
  params: Record<string, unknown>
  schema: Record<string, unknown>
}

export type ValidateParamsResult = { valid: true } | { valid: false; errors: string[] }

const ajv = new Ajv({ allErrors: true, strict: false })

export async function validateToolParams(input: ValidateParamsInput): Promise<ValidateParamsResult> {
  const { params, schema } = input

  const validate = ajv.compile(schema)
  const valid = validate(params)

  if (valid) {
    return { valid: true }
  }

  const errors = (validate.errors ?? []).map((e) => {
    const path = e.instancePath || "root"
    return `${path}: ${e.message}`
  })

  return { valid: false, errors }
}
