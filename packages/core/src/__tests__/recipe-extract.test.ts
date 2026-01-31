import { test, expect } from "vitest"
import { updateBindingRef } from "../recipe-extract"
import type { Value } from "../types"

test("updateBindingRef normalizes array items", () => {
  const binding = {
    type: "array",
    items: [
      { type: "ref", scope: "step", key: "StepOne" },
      { type: "literal", value: "static" },
    ],
  } as unknown as Value
  const map = new Map<string, string>([["StepOne", "step_one"]])

  const result = updateBindingRef(binding, map) as unknown as { type: "array"; items: Value[] }

  expect(result.type).toBe("array")
  expect(result.items[0]).toMatchObject({ type: "ref", scope: "step", key: "step_one" })
})
