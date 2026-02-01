import { test, expect } from "vitest"
import { normalizeStepKeys, updateBindingRef } from "../recipe-extract"
import type { Value } from "../types"
import type { RawStep } from "../recipe-extract"

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

test("normalizeStepKeys preserves select_rows allowNone", () => {
  const rawSteps = [
    {
      stepKey: "Collect",
      label: "Collect",
      toolName: "human_request",
      params: {
        title: { type: "literal", value: "Pick" },
        fields: {
          type: "literal",
          value: [
            {
              kind: "select_rows",
              key: "rows",
              columns: [{ key: "id", label: "ID" }],
              data: [],
              selectionMode: "single",
              allowNone: false,
            },
          ],
        },
      },
    },
  ] as const

  const { steps } = normalizeStepKeys(rawSteps as unknown as RawStep[])
  const step = steps[0]

  expect(step.type).toBe("input")
  if (step.type !== "input") return
  const allowNone = step.config.params.fields[0].allowNone as Value
  expect(allowNone).toMatchObject({ type: "literal", value: false })
})
