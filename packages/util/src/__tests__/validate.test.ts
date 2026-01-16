import { describe, test, expect } from "vitest"
import { validatePayload, validateJsonSchema, validateJsonSchemaForProvider } from "../validate"

describe("Validate", () => {
  describe("payload", () => {
    describe("basic validation", () => {
      test("returns valid for empty schema", () => {
        const result = validatePayload({ foo: "bar" }, {})
        expect(result.valid).toBe(true)
      })

      test("returns valid for null schema", () => {
        const result = validatePayload({ foo: "bar" }, null)
        expect(result.valid).toBe(true)
      })

      test("returns valid for undefined schema", () => {
        const result = validatePayload({ foo: "bar" }, undefined)
        expect(result.valid).toBe(true)
      })

      test("returns valid for non-object schema", () => {
        const result = validatePayload({ foo: "bar" }, "not an object")
        expect(result.valid).toBe(true)
      })
    })

    describe("type validation", () => {
      test("validates string type", () => {
        const schema = { type: "string" }
        expect(validatePayload("hello", schema).valid).toBe(true)
        expect(validatePayload(123, schema).valid).toBe(false)
      })

      test("validates number type", () => {
        const schema = { type: "number" }
        expect(validatePayload(42, schema).valid).toBe(true)
        expect(validatePayload("42", schema).valid).toBe(false)
      })

      test("validates integer type", () => {
        const schema = { type: "integer" }
        expect(validatePayload(42, schema).valid).toBe(true)
        expect(validatePayload(42.5, schema).valid).toBe(false)
      })

      test("validates boolean type", () => {
        const schema = { type: "boolean" }
        expect(validatePayload(true, schema).valid).toBe(true)
        expect(validatePayload(false, schema).valid).toBe(true)
        expect(validatePayload("true", schema).valid).toBe(false)
      })

      test("validates null type", () => {
        const schema = { type: "null" }
        expect(validatePayload(null, schema).valid).toBe(true)
        expect(validatePayload(undefined, schema).valid).toBe(false)
      })

      test("validates array type", () => {
        const schema = { type: "array" }
        expect(validatePayload([1, 2, 3], schema).valid).toBe(true)
        expect(validatePayload({ length: 3 }, schema).valid).toBe(false)
      })

      test("validates object type", () => {
        const schema = { type: "object" }
        expect(validatePayload({ foo: "bar" }, schema).valid).toBe(true)
        expect(validatePayload([1, 2], schema).valid).toBe(false)
      })
    })

    describe("object validation", () => {
      test("validates required properties", () => {
        const schema = {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
        }

        expect(validatePayload({ name: "Alice", age: 30 }, schema).valid).toBe(true)
        expect(validatePayload({ name: "Alice" }, schema).valid).toBe(true)
        expect(validatePayload({ age: 30 }, schema).valid).toBe(false)
      })

      test("validates nested objects", () => {
        const schema = {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                email: { type: "string" },
              },
              required: ["email"],
            },
          },
          required: ["user"],
        }

        expect(validatePayload({ user: { email: "test@example.com" } }, schema).valid).toBe(true)
        expect(validatePayload({ user: {} }, schema).valid).toBe(false)
        expect(validatePayload({}, schema).valid).toBe(false)
      })

      test("allows additional properties by default", () => {
        const schema = {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        }

        expect(validatePayload({ name: "Alice", extra: "value" }, schema).valid).toBe(true)
      })

      test("rejects additional properties when disabled", () => {
        const schema = {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          additionalProperties: false,
        }

        expect(validatePayload({ name: "Alice" }, schema).valid).toBe(true)
        expect(validatePayload({ name: "Alice", extra: "value" }, schema).valid).toBe(false)
      })
    })

    describe("array validation", () => {
      test("validates array items", () => {
        const schema = {
          type: "array",
          items: { type: "number" },
        }

        expect(validatePayload([1, 2, 3], schema).valid).toBe(true)
        expect(validatePayload([1, "two", 3], schema).valid).toBe(false)
      })

      test("validates array minItems", () => {
        const schema = {
          type: "array",
          minItems: 2,
        }

        expect(validatePayload([1, 2], schema).valid).toBe(true)
        expect(validatePayload([1], schema).valid).toBe(false)
      })

      test("validates array maxItems", () => {
        const schema = {
          type: "array",
          maxItems: 3,
        }

        expect(validatePayload([1, 2, 3], schema).valid).toBe(true)
        expect(validatePayload([1, 2, 3, 4], schema).valid).toBe(false)
      })

      test("validates unique items", () => {
        const schema = {
          type: "array",
          uniqueItems: true,
        }

        expect(validatePayload([1, 2, 3], schema).valid).toBe(true)
        expect(validatePayload([1, 2, 2], schema).valid).toBe(false)
      })
    })

    describe("string validation", () => {
      test("validates minLength", () => {
        const schema = { type: "string", minLength: 3 }

        expect(validatePayload("abc", schema).valid).toBe(true)
        expect(validatePayload("ab", schema).valid).toBe(false)
      })

      test("validates maxLength", () => {
        const schema = { type: "string", maxLength: 5 }

        expect(validatePayload("hello", schema).valid).toBe(true)
        expect(validatePayload("hello!", schema).valid).toBe(false)
      })

      test("validates pattern", () => {
        const schema = { type: "string", pattern: "^[a-z]+$" }

        expect(validatePayload("hello", schema).valid).toBe(true)
        expect(validatePayload("Hello", schema).valid).toBe(false)
        expect(validatePayload("hello123", schema).valid).toBe(false)
      })

      test("ignores unknown format (AJV default behavior)", () => {
        const schema = { type: "string", format: "email" }
        expect(validatePayload("test@example.com", schema).valid).toBe(true)
        expect(validatePayload("not-an-email", schema).valid).toBe(true)
      })

      test("validates email-like pattern manually", () => {
        const schema = { type: "string", pattern: "^[^@]+@[^@]+\\.[^@]+$" }

        expect(validatePayload("test@example.com", schema).valid).toBe(true)
        expect(validatePayload("not-an-email", schema).valid).toBe(false)
      })
    })

    describe("number validation", () => {
      test("validates minimum", () => {
        const schema = { type: "number", minimum: 0 }

        expect(validatePayload(0, schema).valid).toBe(true)
        expect(validatePayload(10, schema).valid).toBe(true)
        expect(validatePayload(-1, schema).valid).toBe(false)
      })

      test("validates maximum", () => {
        const schema = { type: "number", maximum: 100 }

        expect(validatePayload(100, schema).valid).toBe(true)
        expect(validatePayload(50, schema).valid).toBe(true)
        expect(validatePayload(101, schema).valid).toBe(false)
      })

      test("validates exclusiveMinimum", () => {
        const schema = { type: "number", exclusiveMinimum: 0 }

        expect(validatePayload(1, schema).valid).toBe(true)
        expect(validatePayload(0, schema).valid).toBe(false)
      })

      test("validates exclusiveMaximum", () => {
        const schema = { type: "number", exclusiveMaximum: 100 }

        expect(validatePayload(99, schema).valid).toBe(true)
        expect(validatePayload(100, schema).valid).toBe(false)
      })

      test("validates multipleOf", () => {
        const schema = { type: "number", multipleOf: 5 }

        expect(validatePayload(10, schema).valid).toBe(true)
        expect(validatePayload(15, schema).valid).toBe(true)
        expect(validatePayload(7, schema).valid).toBe(false)
      })
    })

    describe("enum validation", () => {
      test("validates enum values", () => {
        const schema = { enum: ["red", "green", "blue"] }

        expect(validatePayload("red", schema).valid).toBe(true)
        expect(validatePayload("green", schema).valid).toBe(true)
        expect(validatePayload("yellow", schema).valid).toBe(false)
      })

      test("validates numeric enum", () => {
        const schema = { enum: [1, 2, 3] }

        expect(validatePayload(1, schema).valid).toBe(true)
        expect(validatePayload(4, schema).valid).toBe(false)
      })
    })

    describe("const validation", () => {
      test("validates const value", () => {
        const schema = { const: "fixed" }

        expect(validatePayload("fixed", schema).valid).toBe(true)
        expect(validatePayload("other", schema).valid).toBe(false)
      })
    })

    describe("combinators", () => {
      test("validates anyOf", () => {
        const schema = {
          anyOf: [{ type: "string" }, { type: "number" }],
        }

        expect(validatePayload("hello", schema).valid).toBe(true)
        expect(validatePayload(42, schema).valid).toBe(true)
        expect(validatePayload(true, schema).valid).toBe(false)
      })

      test("validates oneOf", () => {
        const schema = {
          oneOf: [
            { type: "string", maxLength: 5 },
            { type: "string", minLength: 10 },
          ],
        }

        expect(validatePayload("hi", schema).valid).toBe(true)
        expect(validatePayload("verylongstring", schema).valid).toBe(true)
        expect(validatePayload("medium", schema).valid).toBe(false)
      })

      test("validates allOf", () => {
        const schema = {
          allOf: [
            { type: "object", required: ["a"] },
            { type: "object", required: ["b"] },
          ],
        }

        expect(validatePayload({ a: 1, b: 2 }, schema).valid).toBe(true)
        expect(validatePayload({ a: 1 }, schema).valid).toBe(false)
      })

      test("validates not", () => {
        const schema = {
          not: { type: "string" },
        }

        expect(validatePayload(42, schema).valid).toBe(true)
        expect(validatePayload("hello", schema).valid).toBe(false)
      })
    })

    describe("error messages", () => {
      test("returns error path for nested property", () => {
        const schema = {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                email: { type: "string" },
              },
              required: ["email"],
            },
          },
          required: ["user"],
        }

        const result = validatePayload({ user: {} }, schema)
        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.errors.some((e) => e.includes("/user"))).toBe(true)
        }
      })

      test("returns multiple errors with allErrors option", () => {
        const schema = {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name", "age"],
        }

        const result = validatePayload({}, schema)
        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.errors.length).toBe(2)
        }
      })

      test("returns descriptive error for type mismatch", () => {
        const schema = { type: "string" }
        const result = validatePayload(123, schema)

        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.errors[0]).toContain("must be string")
        }
      })
    })

    describe("real-world webhook payload scenarios", () => {
      test("validates typical trigger payload schema", () => {
        const schema = {
          type: "object",
          properties: {
            event: { type: "string", enum: ["created", "updated", "deleted"] },
            data: {
              type: "object",
              properties: {
                id: { type: "string" },
                timestamp: { type: "string" },
              },
              required: ["id"],
            },
          },
          required: ["event", "data"],
        }

        expect(validatePayload({ event: "created", data: { id: "123", timestamp: "2024-01-01" } }, schema).valid).toBe(
          true,
        )
        expect(validatePayload({ event: "invalid", data: { id: "123" } }, schema).valid).toBe(false)
        expect(validatePayload({ event: "created", data: {} }, schema).valid).toBe(false)
      })

      test("validates GitHub webhook payload", () => {
        const schema = {
          type: "object",
          properties: {
            action: { type: "string" },
            repository: {
              type: "object",
              properties: {
                full_name: { type: "string" },
              },
              required: ["full_name"],
            },
            sender: {
              type: "object",
              properties: {
                login: { type: "string" },
              },
            },
          },
          required: ["action", "repository"],
        }

        const payload = {
          action: "opened",
          repository: { full_name: "owner/repo" },
          sender: { login: "username" },
        }

        expect(validatePayload(payload, schema).valid).toBe(true)
      })

      test("validates empty payload against optional schema", () => {
        const schema = {
          type: "object",
          properties: {
            optional_field: { type: "string" },
          },
        }

        expect(validatePayload({}, schema).valid).toBe(true)
      })
    })
  })

  describe("jsonSchema", () => {
    test("accepts valid schema", () => {
      expect(validateJsonSchema({ type: "string" }).valid).toBe(true)
    })

    test("rejects invalid type", () => {
      const result = validateJsonSchema({ type: "any" })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors[0]).toContain("type")
      }
    })

    test("rejects tuple-style items in 2020-12", () => {
      const result = validateJsonSchema({ type: "array", items: [{ type: "string" }] })
      expect(result.valid).toBe(false)
    })

    test("accepts prefixItems with items schema", () => {
      const schema = { type: "array", prefixItems: [{ type: "string" }], items: { type: "string" } }
      expect(validateJsonSchema(schema).valid).toBe(true)
    })
  })

  describe("jsonSchemaProvider", () => {
    test("rejects openai unsupported keyword", () => {
      const result = validateJsonSchemaForProvider({ type: "array", prefixItems: [{ type: "string" }] }, "openai")
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors[0]).toContain("prefixItems")
      }
    })

    test("rejects google unsupported keyword", () => {
      const result = validateJsonSchemaForProvider({ type: "array", contains: { type: "string" } }, "google")
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors[0]).toContain("contains")
      }
    })

    test("accepts google prefixItems", () => {
      const result = validateJsonSchemaForProvider({ type: "array", prefixItems: [{ type: "string" }] }, "google")
      expect(result.valid).toBe(true)
    })

    test("validates nested schemas in $defs", () => {
      const schema = {
        type: "object",
        $defs: {
          MyType: {
            type: "object",
            unevaluatedProperties: false,
          },
        },
      }
      const result = validateJsonSchemaForProvider(schema, "openai")
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("$defs.MyType"))).toBe(true)
        expect(result.errors.some((e) => e.includes("unevaluatedProperties"))).toBe(true)
      }
    })

    test("validates nested schemas in properties", () => {
      const schema = {
        type: "object",
        properties: {
          nested: {
            type: "object",
            unevaluatedProperties: false,
          },
        },
      }
      const result = validateJsonSchemaForProvider(schema, "google")
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("properties.nested"))).toBe(true)
        expect(result.errors.some((e) => e.includes("unevaluatedProperties"))).toBe(true)
      }
    })

    test("accepts anthropic with all keywords", () => {
      const schema = {
        type: "object",
        unevaluatedProperties: false,
        dependentSchemas: { foo: { type: "object" } },
      }
      const result = validateJsonSchemaForProvider(schema, "anthropic")
      expect(result.valid).toBe(true)
    })
  })
})
