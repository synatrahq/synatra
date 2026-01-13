import { describe, test, expect } from "vitest"
import { execute } from "../pool"

describe("paramAlias", () => {
  const baseInput = {
    organizationId: "test-org",
    context: { resources: [] },
    environmentId: "test-env",
    timeout: 5000,
  }

  describe("payload alias", () => {
    test("exposes payload variable when paramAlias is 'payload'", async () => {
      const result = await execute({
        ...baseInput,
        code: "return payload.message",
        params: { message: "hello from payload" },
        paramAlias: "payload",
      })
      expect(result.value).toBe("hello from payload")
    })

    test("payload and params reference the same object", async () => {
      const result = await execute({
        ...baseInput,
        code: "return payload === params",
        params: { x: 1 },
        paramAlias: "payload",
      })
      expect(result.value).toBe(true)
    })

    test("can access nested payload properties", async () => {
      const result = await execute({
        ...baseInput,
        code: "return payload.user.name",
        params: { user: { name: "Alice" } },
        paramAlias: "payload",
      })
      expect(result.value).toBe("Alice")
    })
  })

  describe("input alias", () => {
    test("exposes input variable when paramAlias is 'input'", async () => {
      const result = await execute({
        ...baseInput,
        code: "return input.name",
        params: { name: "test input" },
        paramAlias: "input",
      })
      expect(result.value).toBe("test input")
    })

    test("input and params reference the same object", async () => {
      const result = await execute({
        ...baseInput,
        code: "return input === params",
        params: { x: 1 },
        paramAlias: "input",
      })
      expect(result.value).toBe(true)
    })

    test("can access nested input properties", async () => {
      const result = await execute({
        ...baseInput,
        code: "return input.data.items[0]",
        params: { data: { items: ["first", "second"] } },
        paramAlias: "input",
      })
      expect(result.value).toBe("first")
    })
  })

  describe("no alias", () => {
    test("payload is undefined when paramAlias is not set", async () => {
      const result = await execute({
        ...baseInput,
        code: "return typeof payload",
        params: { x: 1 },
      })
      expect(result.value).toBe("undefined")
    })

    test("input is undefined when paramAlias is not set", async () => {
      const result = await execute({
        ...baseInput,
        code: "return typeof input",
        params: { x: 1 },
      })
      expect(result.value).toBe("undefined")
    })

    test("params is always available", async () => {
      const result = await execute({
        ...baseInput,
        code: "return params.value",
        params: { value: 42 },
      })
      expect(result.value).toBe(42)
    })
  })

  describe("alias exclusivity", () => {
    test("input is undefined when paramAlias is 'payload'", async () => {
      const result = await execute({
        ...baseInput,
        code: "return typeof input",
        params: { x: 1 },
        paramAlias: "payload",
      })
      expect(result.value).toBe("undefined")
    })

    test("payload is undefined when paramAlias is 'input'", async () => {
      const result = await execute({
        ...baseInput,
        code: "return typeof payload",
        params: { x: 1 },
        paramAlias: "input",
      })
      expect(result.value).toBe("undefined")
    })
  })
})
