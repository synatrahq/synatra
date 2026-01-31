import { describe, expect, test } from "vitest"
import { collectStepRefs, validateStepBindings } from "../recipe"
import type { Value, RecipeStepConfig } from "../types"

describe("collectStepRefs", () => {
  test("includes refs from code, timeout, and name", () => {
    const code: Value = { type: "ref", scope: "step", key: "later_code" }
    const timeoutMs: Value = { type: "ref", scope: "step", key: "later_timeout" }
    const name: Value = { type: "ref", scope: "step", key: "later_name" }

    const queryConfig: RecipeStepConfig = {
      description: "Query",
      paramSchema: {},
      returnSchema: {},
      code,
      timeoutMs,
      params: { type: "literal", value: {} },
    }

    const outputConfig: RecipeStepConfig = {
      kind: "markdown",
      name,
      params: { type: "literal", value: {} },
    }

    const refs = [...collectStepRefs(queryConfig), ...collectStepRefs(outputConfig)]

    expect(refs).toContain("later_code")
    expect(refs).toContain("later_timeout")
    expect(refs).toContain("later_name")
  })
})

describe("validateStepBindings", () => {
  test("fails when code references a later step", () => {
    const steps = [
      {
        stepKey: "step_0",
        config: {
          code: { type: "ref", scope: "step", key: "step_1" },
          params: { type: "literal", value: {} },
        },
      },
      {
        stepKey: "step_1",
        config: {
          code: { type: "literal", value: "return 1" },
          params: { type: "literal", value: {} },
        },
      },
    ] as Array<{ stepKey: string; config: RecipeStepConfig }>

    const result = validateStepBindings(steps)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("step_1")
  })
})
