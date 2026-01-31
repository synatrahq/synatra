import { test, expect, vi, beforeEach } from "vitest"

const abortCalls: Array<Record<string, unknown>> = []

vi.mock("@synatra/core", () => ({
  getRecipeById: async () => ({ id: "recipe-1" }),
  abortRecipeExecution: async (input: { id: string; recipeId?: string }) => {
    abortCalls.push(input)
    return {
      id: input.id,
      status: "aborted",
      abortedAt: new Date("2026-01-31T00:00:00.000Z"),
    }
  },
}))

const { abort } = await import("../routes/recipes/abort")

beforeEach(() => {
  abortCalls.length = 0
})

test("recipes.abort returns aborted response", async () => {
  const res = await abort.request("/recipe-1/executions/execution-1/abort", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })

  expect(res.status).toBe(200)
  expect(abortCalls).toEqual([
    {
      id: "execution-1",
      recipeId: "recipe-1",
    },
  ])
  expect(await res.json()).toEqual({
    success: true,
    executionId: "execution-1",
    status: "aborted",
    abortedAt: "2026-01-31T00:00:00.000Z",
  })
})
