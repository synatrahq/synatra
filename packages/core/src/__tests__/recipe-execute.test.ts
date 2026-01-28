import { test, expect, describe } from "vitest"
import {
  getValueByPath,
  resolveBinding,
  resolveStepParams,
  getStepExecutionOrder,
  isHumanInputStep,
  createRecipeRunner,
  getNextStep,
  advanceRunner,
  failRunner,
  pauseRunnerForInput,
  resumeRunnerWithInput,
  type RecipeExecutionContext,
} from "../recipe-execute"
import type { RecipeStep, ParamBinding } from "../types"

describe("getValueByPath", () => {
  test("returns whole object for $ or undefined path", () => {
    const obj = { a: 1, b: 2 }
    expect(getValueByPath(obj, undefined)).toEqual(obj)
    expect(getValueByPath(obj, "$")).toEqual(obj)
  })

  test("returns nested property", () => {
    const obj = { user: { name: "Alice", email: "alice@example.com" } }
    expect(getValueByPath(obj, "$.user.name")).toBe("Alice")
    expect(getValueByPath(obj, "user.email")).toBe("alice@example.com")
  })

  test("returns array element", () => {
    const obj = { users: [{ name: "Alice" }, { name: "Bob" }] }
    expect(getValueByPath(obj, "$.users[0].name")).toBe("Alice")
    expect(getValueByPath(obj, "$.users[1].name")).toBe("Bob")
  })

  test("returns mapped array with wildcard", () => {
    const obj = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(getValueByPath(obj, "$[*].id")).toEqual([1, 2, 3])
  })

  test("returns undefined for non-existent path", () => {
    const obj = { a: 1 }
    expect(getValueByPath(obj, "$.b")).toBeUndefined()
    expect(getValueByPath(obj, "$.a.b.c")).toBeUndefined()
  })
})

describe("resolveBinding", () => {
  const context: RecipeExecutionContext = {
    inputs: { userId: "123", name: "Alice" },
    results: {
      step_0: {
        data: [
          { id: 1, email: "a@test.com" },
          { id: 2, email: "b@test.com" },
        ],
      },
      step_1: "processed",
    },
    resolvedParams: {},
  }

  test("resolves static binding", () => {
    const binding: ParamBinding = { type: "static", value: 42 }
    expect(resolveBinding(binding, context)).toBe(42)
  })

  test("resolves input binding", () => {
    const binding: ParamBinding = { type: "input", inputKey: "userId" }
    expect(resolveBinding(binding, context)).toBe("123")
  })

  test("resolves step binding without path", () => {
    const binding: ParamBinding = { type: "step", stepId: "step_1" }
    expect(resolveBinding(binding, context)).toBe("processed")
  })

  test("resolves step binding with path", () => {
    const binding: ParamBinding = { type: "step", stepId: "step_0", path: "$.data[0].email" }
    expect(resolveBinding(binding, context)).toBe("a@test.com")
  })

  test("resolves template binding", () => {
    const binding: ParamBinding = {
      type: "template",
      template: "Hello {{name}}, your ID is {{id}}",
      variables: {
        name: { type: "input", inputKey: "name" },
        id: { type: "input", inputKey: "userId" },
      },
    }
    expect(resolveBinding(binding, context)).toBe("Hello Alice, your ID is 123")
  })

  test("resolves object binding", () => {
    const binding: ParamBinding = {
      type: "object",
      entries: {
        user: { type: "input", inputKey: "name" },
        email: { type: "step", stepId: "step_0", path: "$.data[0].email" },
      },
    }
    expect(resolveBinding(binding, context)).toEqual({
      user: "Alice",
      email: "a@test.com",
    })
  })
})

describe("resolveStepParams", () => {
  test("resolves all params for a step", () => {
    const step: RecipeStep = {
      id: "step_1",
      toolName: "send_email",
      params: {
        to: { type: "step", stepId: "step_0", path: "$.email" },
        subject: { type: "static", value: "Hello" },
        name: { type: "input", inputKey: "userName" },
      },
      dependsOn: ["step_0"],
    }

    const context: RecipeExecutionContext = {
      inputs: { userName: "Bob" },
      results: { step_0: { email: "bob@test.com" } },
      resolvedParams: {},
    }

    const result = resolveStepParams(step, context)
    expect(result).toEqual({
      to: "bob@test.com",
      subject: "Hello",
      name: "Bob",
    })
  })
})

describe("getStepExecutionOrder", () => {
  test("returns steps in dependency order", () => {
    const steps: RecipeStep[] = [
      { id: "step_2", toolName: "c", params: {}, dependsOn: ["step_1"] },
      { id: "step_0", toolName: "a", params: {}, dependsOn: [] },
      { id: "step_1", toolName: "b", params: {}, dependsOn: ["step_0"] },
    ]

    const ordered = getStepExecutionOrder(steps)
    expect(ordered.map((s) => s.id)).toEqual(["step_0", "step_1", "step_2"])
  })

  test("handles parallel steps", () => {
    const steps: RecipeStep[] = [
      { id: "step_0", toolName: "a", params: {}, dependsOn: [] },
      { id: "step_1", toolName: "b", params: {}, dependsOn: [] },
      { id: "step_2", toolName: "c", params: {}, dependsOn: ["step_0", "step_1"] },
    ]

    const ordered = getStepExecutionOrder(steps)
    const step2Index = ordered.findIndex((s) => s.id === "step_2")
    expect(step2Index).toBe(2)
  })
})

describe("isHumanInputStep", () => {
  test("returns true for form human_request", () => {
    const step: RecipeStep = {
      id: "step_0",
      toolName: "human_request",
      params: {
        title: { type: "static", value: "Input" },
        fields: { type: "static", value: [{ kind: "form", key: "data", schema: {} }] },
      },
      dependsOn: [],
    }
    expect(isHumanInputStep(step)).toBe(true)
  })

  test("returns true for question human_request", () => {
    const step: RecipeStep = {
      id: "step_0",
      toolName: "human_request",
      params: {
        title: { type: "static", value: "Question" },
        fields: { type: "static", value: [{ kind: "question", key: "answer" }] },
      },
      dependsOn: [],
    }
    expect(isHumanInputStep(step)).toBe(true)
  })

  test("returns false for confirm human_request", () => {
    const step: RecipeStep = {
      id: "step_0",
      toolName: "human_request",
      params: {
        title: { type: "static", value: "Confirm" },
        fields: { type: "static", value: [{ kind: "confirm", key: "confirmed" }] },
      },
      dependsOn: [],
    }
    expect(isHumanInputStep(step)).toBe(false)
  })

  test("returns false for non-human_request tool", () => {
    const step: RecipeStep = {
      id: "step_0",
      toolName: "fetch_data",
      params: {},
      dependsOn: [],
    }
    expect(isHumanInputStep(step)).toBe(false)
  })
})

describe("RecipeRunner", () => {
  const steps: RecipeStep[] = [
    { id: "step_0", toolName: "fetch", params: {}, dependsOn: [] },
    { id: "step_1", toolName: "transform", params: {}, dependsOn: ["step_0"] },
    { id: "step_2", toolName: "output", params: {}, dependsOn: ["step_1"] },
  ]

  test("createRecipeRunner initializes correctly", () => {
    const runner = createRecipeRunner(steps, { input: "test" })

    expect(runner.status).toBe("pending")
    expect(runner.currentStepIndex).toBe(0)
    expect(runner.context.inputs).toEqual({ input: "test" })
    expect(runner.context.results).toEqual({})
    expect(runner.steps.map((s) => s.id)).toEqual(["step_0", "step_1", "step_2"])
  })

  test("getNextStep returns current step", () => {
    const runner = createRecipeRunner(steps, {})
    const step = getNextStep(runner)

    expect(step?.id).toBe("step_0")
  })

  test("advanceRunner moves to next step", () => {
    let runner = createRecipeRunner(steps, {})
    runner = advanceRunner(runner, "step_0", { data: "result" })

    expect(runner.currentStepIndex).toBe(1)
    expect(runner.context.results.step_0).toEqual({ data: "result" })
    expect(runner.status).toBe("running")
  })

  test("advanceRunner marks completed on last step", () => {
    let runner = createRecipeRunner(steps, {})
    runner = advanceRunner(runner, "step_0", "r0")
    runner = advanceRunner(runner, "step_1", "r1")
    runner = advanceRunner(runner, "step_2", "r2")

    expect(runner.status).toBe("completed")
    expect(getNextStep(runner)).toBeNull()
  })

  test("failRunner sets error status", () => {
    let runner = createRecipeRunner(steps, {})
    runner = failRunner(runner, "Something went wrong")

    expect(runner.status).toBe("failed")
    expect(runner.error).toBe("Something went wrong")
  })

  test("pauseRunnerForInput sets waiting status", () => {
    let runner = createRecipeRunner(steps, {})
    runner = pauseRunnerForInput(runner)

    expect(runner.status).toBe("waiting_input")
  })

  test("resumeRunnerWithInput continues execution", () => {
    let runner = createRecipeRunner(steps, {})
    runner = pauseRunnerForInput(runner)
    runner = resumeRunnerWithInput(runner, "step_0", { userInput: "value" })

    expect(runner.status).toBe("running")
    expect(runner.currentStepIndex).toBe(1)
    expect(runner.context.results.step_0).toEqual({ userInput: "value" })
  })
})
