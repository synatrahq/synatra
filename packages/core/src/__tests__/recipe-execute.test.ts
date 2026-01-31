import { test, expect, describe } from "vitest"
import {
  getValueByPath,
  resolveBinding,
  resolveStepParams,
  getStepExecutionOrder,
  isInputStep,
  createRecipeRunner,
  getNextStep,
  advanceRunner,
  failRunner,
  pauseRunnerForInput,
  resumeRunnerWithInput,
  type RecipeExecutionContext,
  type NormalizedStep,
} from "../recipe-execute"
import type { ParamBinding } from "../types"

describe("getValueByPath", () => {
  test("returns whole object for empty or undefined path", () => {
    const obj = { a: 1, b: 2 }
    expect(getValueByPath(obj, undefined)).toEqual(obj)
    expect(getValueByPath(obj, [])).toEqual(obj)
  })

  test("returns nested property", () => {
    const obj = { user: { name: "Alice", email: "alice@example.com" } }
    expect(getValueByPath(obj, ["user", "name"])).toBe("Alice")
    expect(getValueByPath(obj, ["user", "email"])).toBe("alice@example.com")
  })

  test("returns array element", () => {
    const obj = { users: [{ name: "Alice" }, { name: "Bob" }] }
    expect(getValueByPath(obj, ["users", 0, "name"])).toBe("Alice")
    expect(getValueByPath(obj, ["users", 1, "name"])).toBe("Bob")
  })

  test("returns mapped array with wildcard", () => {
    const obj = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(getValueByPath(obj, ["*", "id"])).toEqual([1, 2, 3])
  })

  test("returns undefined for non-existent path", () => {
    const obj = { a: 1 }
    expect(getValueByPath(obj, ["b"])).toBeUndefined()
    expect(getValueByPath(obj, ["a", "b", "c"])).toBeUndefined()
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

  test("resolves literal binding", () => {
    const binding: ParamBinding = { type: "literal", value: 42 }
    expect(resolveBinding(binding, context)).toBe(42)
  })

  test("resolves input ref", () => {
    const binding: ParamBinding = { type: "ref", scope: "input", key: "userId" }
    expect(resolveBinding(binding, context)).toBe("123")
  })

  test("resolves step ref without path", () => {
    const binding: ParamBinding = { type: "ref", scope: "step", key: "step_1" }
    expect(resolveBinding(binding, context)).toBe("processed")
  })

  test("resolves step ref with path", () => {
    const binding: ParamBinding = { type: "ref", scope: "step", key: "step_0", path: ["data", 0, "email"] }
    expect(resolveBinding(binding, context)).toBe("a@test.com")
  })

  test("resolves template binding", () => {
    const binding: ParamBinding = {
      type: "template",
      parts: [
        "Hello ",
        { type: "ref", scope: "input", key: "name" },
        ", your ID is ",
        { type: "ref", scope: "input", key: "userId" },
      ],
    }
    expect(resolveBinding(binding, context)).toBe("Hello Alice, your ID is 123")
  })

  test("resolves object binding", () => {
    const binding: ParamBinding = {
      type: "object",
      entries: {
        user: { type: "ref", scope: "input", key: "name" },
        email: { type: "ref", scope: "step", key: "step_0", path: ["data", 0, "email"] },
      },
    }
    expect(resolveBinding(binding, context)).toEqual({
      user: "Alice",
      email: "a@test.com",
    })
  })

  test("resolves array binding", () => {
    const binding: ParamBinding = {
      type: "array",
      items: [
        { type: "ref", scope: "input", key: "userId" },
        { type: "ref", scope: "input", key: "name" },
      ],
    }
    expect(resolveBinding(binding, context)).toEqual(["123", "Alice"])
  })
})

describe("resolveBinding with cast (as)", () => {
  test("casts string to number", () => {
    const context: RecipeExecutionContext = {
      inputs: { count: "42" },
      results: {},
      resolvedParams: {},
    }
    const binding: ParamBinding = { type: "ref", scope: "input", key: "count", as: "number" }
    expect(resolveBinding(binding, context)).toBe(42)
  })

  test("casts number string with decimals", () => {
    const context: RecipeExecutionContext = {
      inputs: { price: "19.99" },
      results: {},
      resolvedParams: {},
    }
    const binding: ParamBinding = { type: "ref", scope: "input", key: "price", as: "number" }
    expect(resolveBinding(binding, context)).toBe(19.99)
  })

  test("returns undefined for invalid number cast", () => {
    const context: RecipeExecutionContext = {
      inputs: { value: "not-a-number" },
      results: {},
      resolvedParams: {},
    }
    const binding: ParamBinding = { type: "ref", scope: "input", key: "value", as: "number" }
    expect(resolveBinding(binding, context)).toBeUndefined()
  })

  test("returns undefined for empty string to number", () => {
    const context: RecipeExecutionContext = {
      inputs: { value: "   " },
      results: {},
      resolvedParams: {},
    }
    const binding: ParamBinding = { type: "ref", scope: "input", key: "value", as: "number" }
    expect(resolveBinding(binding, context)).toBeUndefined()
  })

  test("casts string 'true' to boolean", () => {
    const context: RecipeExecutionContext = {
      inputs: { flag: "true" },
      results: {},
      resolvedParams: {},
    }
    const binding: ParamBinding = { type: "ref", scope: "input", key: "flag", as: "boolean" }
    expect(resolveBinding(binding, context)).toBe(true)
  })

  test("casts string 'false' to boolean", () => {
    const context: RecipeExecutionContext = {
      inputs: { flag: "FALSE" },
      results: {},
      resolvedParams: {},
    }
    const binding: ParamBinding = { type: "ref", scope: "input", key: "flag", as: "boolean" }
    expect(resolveBinding(binding, context)).toBe(false)
  })

  test("casts number to boolean", () => {
    const context: RecipeExecutionContext = {
      inputs: { zero: 0, one: 1 },
      results: {},
      resolvedParams: {},
    }
    expect(resolveBinding({ type: "ref", scope: "input", key: "zero", as: "boolean" }, context)).toBe(false)
    expect(resolveBinding({ type: "ref", scope: "input", key: "one", as: "boolean" }, context)).toBe(true)
  })

  test("returns undefined for invalid boolean cast", () => {
    const context: RecipeExecutionContext = {
      inputs: { value: "yes" },
      results: {},
      resolvedParams: {},
    }
    const binding: ParamBinding = { type: "ref", scope: "input", key: "value", as: "boolean" }
    expect(resolveBinding(binding, context)).toBeUndefined()
  })

  test("casts to string", () => {
    const context: RecipeExecutionContext = {
      inputs: { num: 42, flag: true },
      results: {},
      resolvedParams: {},
    }
    expect(resolveBinding({ type: "ref", scope: "input", key: "num", as: "string" }, context)).toBe("42")
    expect(resolveBinding({ type: "ref", scope: "input", key: "flag", as: "string" }, context)).toBe("true")
  })

  test("casts null/undefined to empty string", () => {
    const context: RecipeExecutionContext = {
      inputs: { empty: null },
      results: {},
      resolvedParams: {},
    }
    expect(resolveBinding({ type: "ref", scope: "input", key: "empty", as: "string" }, context)).toBe("")
    expect(resolveBinding({ type: "ref", scope: "input", key: "missing", as: "string" }, context)).toBe("")
  })

  test("validates object cast", () => {
    const context: RecipeExecutionContext = {
      inputs: {},
      results: { data: { name: "test" }, arr: [1, 2, 3] },
      resolvedParams: {},
    }
    expect(resolveBinding({ type: "ref", scope: "step", key: "data", as: "object" }, context)).toEqual({ name: "test" })
    expect(resolveBinding({ type: "ref", scope: "step", key: "arr", as: "object" }, context)).toBeUndefined()
  })

  test("validates array cast", () => {
    const context: RecipeExecutionContext = {
      inputs: {},
      results: { arr: [1, 2, 3], obj: { a: 1 } },
      resolvedParams: {},
    }
    expect(resolveBinding({ type: "ref", scope: "step", key: "arr", as: "array" }, context)).toEqual([1, 2, 3])
    expect(resolveBinding({ type: "ref", scope: "step", key: "obj", as: "array" }, context)).toBeUndefined()
  })
})

describe("resolveStepParams", () => {
  test("resolves binding for a query step", () => {
    const step: NormalizedStep = {
      stepKey: "step_1",
      label: "Send email",
      type: "query",
      config: {
        description: "Send email",
        paramSchema: {},
        returnSchema: {},
        code: { type: "literal", value: "return params" },
        params: {
          type: "object",
          entries: {
            to: { type: "ref", scope: "step", key: "step_0", path: ["email"] },
            subject: { type: "literal", value: "Hello" },
            name: { type: "ref", scope: "input", key: "userName" },
          },
        },
      },
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
  test("returns steps in same order (already ordered)", () => {
    const steps: NormalizedStep[] = [
      {
        stepKey: "step_0",
        label: "Step A",
        type: "query",
        config: {
          description: "",
          paramSchema: {},
          returnSchema: {},
          code: { type: "literal", value: "" },
          params: { type: "literal", value: {} },
        },
      },
      {
        stepKey: "step_1",
        label: "Step B",
        type: "query",
        config: {
          description: "",
          paramSchema: {},
          returnSchema: {},
          code: { type: "literal", value: "" },
          params: { type: "literal", value: {} },
        },
      },
      {
        stepKey: "step_2",
        label: "Step C",
        type: "query",
        config: {
          description: "",
          paramSchema: {},
          returnSchema: {},
          code: { type: "literal", value: "" },
          params: { type: "literal", value: {} },
        },
      },
    ]

    const ordered = getStepExecutionOrder(steps)
    expect(ordered.map((s) => s.stepKey)).toEqual(["step_0", "step_1", "step_2"])
  })
})

describe("isInputStep", () => {
  test("returns true for input step", () => {
    const step: NormalizedStep = {
      stepKey: "step_0",
      label: "Input form",
      type: "input",
      config: {
        params: {
          title: { type: "literal", value: "Input" },
          fields: [
            {
              kind: { type: "literal", value: "form" },
              key: { type: "literal", value: "data" },
              schema: { type: "literal", value: {} },
            },
          ],
        },
      },
    }
    expect(isInputStep(step)).toBe(true)
  })

  test("returns false for query step", () => {
    const step: NormalizedStep = {
      stepKey: "step_0",
      label: "Fetch data",
      type: "query",
      config: {
        description: "",
        paramSchema: {},
        returnSchema: {},
        code: { type: "literal", value: "" },
        params: { type: "literal", value: {} },
      },
    }
    expect(isInputStep(step)).toBe(false)
  })

  test("returns false for output step", () => {
    const step: NormalizedStep = {
      stepKey: "step_0",
      label: "Output data",
      type: "output",
      config: { kind: "table", params: { type: "literal", value: {} } },
    }
    expect(isInputStep(step)).toBe(false)
  })
})

describe("RecipeRunner", () => {
  const steps: NormalizedStep[] = [
    {
      stepKey: "step_0",
      label: "Fetch data",
      type: "query",
      config: {
        description: "",
        paramSchema: {},
        returnSchema: {},
        code: { type: "literal", value: "" },
        params: { type: "literal", value: {} },
      },
    },
    {
      stepKey: "step_1",
      label: "Transform data",
      type: "query",
      config: {
        description: "",
        paramSchema: {},
        returnSchema: {},
        code: { type: "literal", value: "" },
        params: { type: "literal", value: {} },
      },
    },
    {
      stepKey: "step_2",
      label: "Output result",
      type: "output",
      config: { kind: "table", params: { type: "literal", value: {} } },
    },
  ]

  test("createRecipeRunner initializes correctly", () => {
    const runner = createRecipeRunner(steps, { input: "test" })

    expect(runner.status).toBe("pending")
    expect(runner.currentStepIndex).toBe(0)
    expect(runner.context.inputs).toEqual({ input: "test" })
    expect(runner.context.results).toEqual({})
    expect(runner.steps.map((s) => s.stepKey)).toEqual(["step_0", "step_1", "step_2"])
  })

  test("getNextStep returns current step", () => {
    const runner = createRecipeRunner(steps, {})
    const step = getNextStep(runner)

    expect(step?.stepKey).toBe("step_0")
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
