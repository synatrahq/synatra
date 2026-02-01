import { test, expect } from "vitest"
import { validateRecipeStructure } from "../recipe-extract"
import type { RecipeStepInput } from "../types"

const baseStep: RecipeStepInput = {
  stepKey: "step_one",
  label: "Step one",
  type: "query",
  config: {
    description: "desc",
    paramSchema: {},
    returnSchema: {},
    code: { type: "literal", value: "" },
    params: { type: "object", entries: {} },
  },
}

test("validateRecipeStructure rejects invalid template parts", () => {
  const invalid = {
    ...baseStep,
    config: {
      ...baseStep.config,
      params: {
        type: "object",
        entries: {
          impact_summary: {
            type: "template",
            parts: ["Insert 1 new user"],
          },
        },
      },
    },
  } as unknown as RecipeStepInput
  const errors = validateRecipeStructure([invalid])

  expect(errors.length).toBeGreaterThan(0)
  expect(errors.join(" ")).toContain("config.params")
})

test("validateRecipeStructure rejects array items that are not arrays", () => {
  const invalid = {
    ...baseStep,
    config: {
      ...baseStep.config,
      params: {
        type: "array",
        items: { type: "ref", scope: "step", key: "step_one" },
      },
    },
  } as unknown as RecipeStepInput
  const errors = validateRecipeStructure([invalid])

  expect(errors.length).toBeGreaterThan(0)
})
