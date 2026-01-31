import { test, expect, vi, beforeEach } from "vitest"

const updateCalls: Array<Record<string, unknown>> = []
let pendingExecutionResult: Record<string, unknown> | undefined

vi.mock("@synatra/core", () => ({
  principal: {
    orgId: () => "org-1",
  },
  getRecipeById: async () => ({ id: "recipe-1" }),
  getRecipeExecutionById: async (id: string) => ({
    id,
    recipeId: "recipe-1",
    releaseId: "release-1",
    organizationId: "org-1",
    environmentId: "env-1",
    currentStepKey: "step-1",
    results: {},
    inputs: {},
    outputItemIds: [],
    pendingInputConfig: { fields: [] },
  }),
  respondToRecipeExecution: async (input: { id: string; response: Record<string, unknown> }) => ({
    execution: {
      id: input.id,
      recipeId: "recipe-1",
      releaseId: "release-1",
      organizationId: "org-1",
      environmentId: "env-1",
      currentStepKey: "step-1",
      results: {},
      inputs: {},
      outputItemIds: [],
      pendingInputConfig: { fields: [] },
    },
    response: input.response,
  }),
  getRecipeRelease: async () => ({ steps: [], outputs: [] }),
  listResources: async () => [],
  updateRecipeExecution: async (input: Record<string, unknown>) => {
    updateCalls.push(input)
    return null
  },
  deleteRecipeExecution: async () => null,
  createOutputItemAndIncrementSeq: async () => null,
  findPendingExecution: async () => pendingExecutionResult,
  buildNormalizedSteps: () => [{ stepKey: "step-1" }],
  getStepExecutionOrder: (steps: Array<{ stepKey: string }>) => steps,
  executeStepLoop: async () => ({
    status: "waiting_input",
    currentStepKey: "step-1",
    pendingInputConfig: { fields: [] },
    stepResults: {},
    outputItemIds: [],
    resolvedParams: {},
  }),
}))

vi.mock("@synatra/core/types", () => ({
  isManagedResourceType: () => false,
}))

vi.mock("@synatra/service-call", () => ({
  loadConfig: () => ({}),
  createCodeExecutor: () => ({
    execute: vi.fn(),
  }),
}))

const { respond } = await import("../routes/recipes/respond")
const { pendingExecution } = await import("../routes/recipes/pending-execution")

beforeEach(() => {
  updateCalls.length = 0
  pendingExecutionResult = undefined
})

test("recipes.respond does not clear pending input before loop completes", async () => {
  const res = await respond.request("/recipe-1/executions/execution-1/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: { answer: "ok" } }),
  })

  expect(res.status).toBe(200)
  expect(updateCalls.length).toBe(1)
  expect(updateCalls.some((call) => call.pendingInputConfig === null)).toBe(false)
})

test("recipes.pending-execution returns null when none exists", async () => {
  const res = await pendingExecution.request("/recipe-1/pending-execution")

  expect(res.status).toBe(200)
  expect(await res.json()).toBeNull()
})
