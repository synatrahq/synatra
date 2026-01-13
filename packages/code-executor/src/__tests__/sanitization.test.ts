import { describe, test, expect } from "vitest"
import { execute } from "../pool"

describe("data sanitization", () => {
  const baseInput = {
    organizationId: "test-org",
    context: { resources: [] },
    environmentId: "test-env",
    timeout: 5000,
  }

  describe("primitive types", () => {
    test("preserves strings", async () => {
      const result = await execute({
        ...baseInput,
        code: 'return "hello"',
        params: {},
      })
      expect(result.value).toBe("hello")
    })

    test("preserves numbers", async () => {
      const result = await execute({
        ...baseInput,
        code: "return 42.5",
        params: {},
      })
      expect(result.value).toBe(42.5)
    })

    test("preserves booleans", async () => {
      const result = await execute({
        ...baseInput,
        code: "return true",
        params: {},
      })
      expect(result.value).toBe(true)
    })

    test("preserves null", async () => {
      const result = await execute({
        ...baseInput,
        code: "return null",
        params: {},
      })
      expect(result.value).toBe(null)
    })

    test("converts undefined to null", async () => {
      const result = await execute({
        ...baseInput,
        code: "return undefined",
        params: {},
      })
      expect(result.value).toBe(null)
    })
  })

  describe("Date serialization", () => {
    test("converts Date to ISO string", async () => {
      const result = await execute({
        ...baseInput,
        code: 'return new Date("2024-01-15T10:30:00.000Z")',
        params: {},
      })
      expect(result.value).toBe("2024-01-15T10:30:00.000Z")
    })

    test("converts Date in object", async () => {
      const result = await execute({
        ...baseInput,
        code: 'return { created: new Date("2024-06-01T00:00:00.000Z") }',
        params: {},
      })
      expect(result.value).toEqual({ created: "2024-06-01T00:00:00.000Z" })
    })

    test("converts Date in array", async () => {
      const result = await execute({
        ...baseInput,
        code: 'return [new Date("2024-01-01T00:00:00.000Z"), new Date("2024-12-31T23:59:59.000Z")]',
        params: {},
      })
      expect(result.value).toEqual(["2024-01-01T00:00:00.000Z", "2024-12-31T23:59:59.000Z"])
    })
  })

  describe("Map serialization", () => {
    test("converts Map to array of entries", async () => {
      const result = await execute({
        ...baseInput,
        code: 'return new Map([["a", 1], ["b", 2]])',
        params: {},
      })
      expect(result.value).toEqual([
        ["a", 1],
        ["b", 2],
      ])
    })

    test("converts empty Map to empty array", async () => {
      const result = await execute({
        ...baseInput,
        code: "return new Map()",
        params: {},
      })
      expect(result.value).toEqual([])
    })
  })

  describe("Set serialization", () => {
    test("converts Set to array of values", async () => {
      const result = await execute({
        ...baseInput,
        code: "return new Set([1, 2, 3])",
        params: {},
      })
      expect(result.value).toEqual([1, 2, 3])
    })

    test("converts empty Set to empty array", async () => {
      const result = await execute({
        ...baseInput,
        code: "return new Set()",
        params: {},
      })
      expect(result.value).toEqual([])
    })

    test("Set deduplicates values", async () => {
      const result = await execute({
        ...baseInput,
        code: "return new Set([1, 1, 2, 2, 3])",
        params: {},
      })
      expect(result.value).toEqual([1, 2, 3])
    })
  })

  describe("nested structures", () => {
    test("handles deeply nested objects", async () => {
      const result = await execute({
        ...baseInput,
        code: "return { a: { b: { c: { d: 'deep' } } } }",
        params: {},
      })
      expect(result.value).toEqual({ a: { b: { c: { d: "deep" } } } })
    })

    test("handles arrays of objects", async () => {
      const result = await execute({
        ...baseInput,
        code: "return [{ id: 1 }, { id: 2 }]",
        params: {},
      })
      expect(result.value).toEqual([{ id: 1 }, { id: 2 }])
    })

    test("handles objects with arrays", async () => {
      const result = await execute({
        ...baseInput,
        code: "return { items: [1, 2, 3], tags: ['a', 'b'] }",
        params: {},
      })
      expect(result.value).toEqual({ items: [1, 2, 3], tags: ["a", "b"] })
    })

    test("handles mixed nested types", async () => {
      const result = await execute({
        ...baseInput,
        code: `return {
          date: new Date("2024-01-01T00:00:00.000Z"),
          set: new Set([1, 2]),
          map: new Map([["key", "value"]]),
          nested: { arr: [1, 2, 3] }
        }`,
        params: {},
      })
      expect(result.value).toEqual({
        date: "2024-01-01T00:00:00.000Z",
        set: [1, 2],
        map: [["key", "value"]],
        nested: { arr: [1, 2, 3] },
      })
    })
  })

  describe("edge cases", () => {
    test("handles empty object", async () => {
      const result = await execute({
        ...baseInput,
        code: "return {}",
        params: {},
      })
      expect(result.value).toEqual({})
    })

    test("handles empty array", async () => {
      const result = await execute({
        ...baseInput,
        code: "return []",
        params: {},
      })
      expect(result.value).toEqual([])
    })

    test("handles special number values", async () => {
      const result = await execute({
        ...baseInput,
        code: "return { inf: Infinity, negInf: -Infinity, nan: NaN }",
        params: {},
      })
      expect(result.value).toEqual({ inf: null, negInf: null, nan: null })
    })
  })
})
