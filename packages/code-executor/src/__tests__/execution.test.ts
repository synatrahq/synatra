import { describe, test, expect } from "vitest"
import { execute, stats, QueueFullError } from "../pool"

describe("code execution", () => {
  const baseInput = {
    organizationId: "test-org",
    context: { resources: [] },
    environmentId: "test-env",
    timeout: 5000,
  }

  describe("basic execution", () => {
    test("executes simple return statement", async () => {
      const result = await execute({
        ...baseInput,
        code: "return 42",
        params: {},
      })
      expect(result.value).toBe(42)
    })

    test("executes arithmetic expressions", async () => {
      const result = await execute({
        ...baseInput,
        code: "return 2 + 3 * 4",
        params: {},
      })
      expect(result.value).toBe(14)
    })

    test("executes string operations", async () => {
      const result = await execute({
        ...baseInput,
        code: 'return "hello" + " " + "world"',
        params: {},
      })
      expect(result.value).toBe("hello world")
    })

    test("returns null for undefined result", async () => {
      const result = await execute({
        ...baseInput,
        code: "const x = 1",
        params: {},
      })
      expect(result.value).toBe(null)
    })

    test("returns objects", async () => {
      const result = await execute({
        ...baseInput,
        code: 'return { name: "test", value: 123 }',
        params: {},
      })
      expect(result.value).toEqual({ name: "test", value: 123 })
    })

    test("returns arrays", async () => {
      const result = await execute({
        ...baseInput,
        code: "return [1, 2, 3]",
        params: {},
      })
      expect(result.value).toEqual([1, 2, 3])
    })
  })

  describe("async execution", () => {
    test("executes async code with await", async () => {
      const result = await execute({
        ...baseInput,
        code: `
          const asyncFn = async () => "async result";
          return await asyncFn();
        `,
        params: {},
      })
      expect(result.value).toBe("async result")
    })

    test("executes Promise.resolve", async () => {
      const result = await execute({
        ...baseInput,
        code: "return await Promise.resolve(99)",
        params: {},
      })
      expect(result.value).toBe(99)
    })
  })

  describe("params access", () => {
    test("accesses params object", async () => {
      const result = await execute({
        ...baseInput,
        code: "return params",
        params: { foo: "bar", num: 42 },
      })
      expect(result.value).toEqual({ foo: "bar", num: 42 })
    })

    test("accesses nested params", async () => {
      const result = await execute({
        ...baseInput,
        code: "return params.user.email",
        params: { user: { email: "test@example.com" } },
      })
      expect(result.value).toBe("test@example.com")
    })

    test("handles empty params", async () => {
      const result = await execute({
        ...baseInput,
        code: "return Object.keys(params).length",
        params: {},
      })
      expect(result.value).toBe(0)
    })
  })

  describe("console.log capture", () => {
    test("captures single console.log", async () => {
      const result = await execute({
        ...baseInput,
        code: 'console.log("hello"); return null',
        params: {},
      })
      expect(result.logs).toEqual([["hello"]])
    })

    test("captures multiple console.log calls", async () => {
      const result = await execute({
        ...baseInput,
        code: 'console.log("first"); console.log("second"); return null',
        params: {},
      })
      expect(result.logs).toEqual([["first"], ["second"]])
    })

    test("captures console.log with multiple arguments", async () => {
      const result = await execute({
        ...baseInput,
        code: 'console.log("value:", 42, true); return null',
        params: {},
      })
      expect(result.logs).toEqual([["value:", 42, true]])
    })

    test("captures console.log with objects", async () => {
      const result = await execute({
        ...baseInput,
        code: 'console.log({ key: "value" }); return null',
        params: {},
      })
      expect(result.logs).toEqual([[{ key: "value" }]])
    })
  })

  describe("error handling", () => {
    test("throws on syntax error", async () => {
      await expect(
        execute({
          ...baseInput,
          code: "return {",
          params: {},
        }),
      ).rejects.toThrow()
    })

    test("throws on runtime error", async () => {
      await expect(
        execute({
          ...baseInput,
          code: "throw new Error('test error')",
          params: {},
        }),
      ).rejects.toThrow("test error")
    })

    test("throws on undefined variable access", async () => {
      await expect(
        execute({
          ...baseInput,
          code: "return undefinedVariable.property",
          params: {},
        }),
      ).rejects.toThrow()
    })
  })

  describe("timeout handling", () => {
    test("completes within timeout", async () => {
      const result = await execute({
        ...baseInput,
        code: "return 'fast'",
        params: {},
        timeout: 1000,
      })
      expect(result.value).toBe("fast")
    })

    test("throws on timeout exceeded", async () => {
      await expect(
        execute({
          ...baseInput,
          code: "while(true) {}",
          params: {},
          timeout: 100,
        }),
      ).rejects.toThrow()
    })
  })

  describe("duration tracking", () => {
    test("returns execution duration", async () => {
      const result = await execute({
        ...baseInput,
        code: "return 1",
        params: {},
      })
      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(typeof result.duration).toBe("number")
    })
  })

  describe("pool stats", () => {
    test("returns pool statistics", () => {
      const s = stats()
      expect(s.total).toBeGreaterThan(0)
      expect(s.available).toBeGreaterThanOrEqual(0)
      expect(s.pending).toBeGreaterThanOrEqual(0)
    })
  })
})
