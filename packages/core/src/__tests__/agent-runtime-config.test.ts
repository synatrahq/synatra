import { describe, test, expect } from "vitest"
import { AgentRuntimeConfigSchema } from "../types/agent"

const baseConfig = (toolName: string) => ({
  model: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
  },
  systemPrompt: "test",
  tools: [
    {
      name: toolName,
      description: "test tool",
      params: { type: "object", properties: {} },
      returns: { type: "object", properties: {} },
      code: "return null",
    },
  ],
})

describe("AgentRuntimeConfigSchema", () => {
  test("accepts non-system tool names", () => {
    const result = AgentRuntimeConfigSchema.safeParse(baseConfig("my_tool"))
    expect(result.success).toBe(true)
  })

  test("rejects output system tool names", () => {
    const result = AgentRuntimeConfigSchema.safeParse(baseConfig("output_table"))
    expect(result.success).toBe(false)
  })

  test("rejects human system tool names", () => {
    const result = AgentRuntimeConfigSchema.safeParse(baseConfig("human_request"))
    expect(result.success).toBe(false)
  })

  test("rejects completion system tool names", () => {
    const result = AgentRuntimeConfigSchema.safeParse(baseConfig("task_complete"))
    expect(result.success).toBe(false)
  })

  test("rejects delegation tool prefix", () => {
    const result = AgentRuntimeConfigSchema.safeParse(baseConfig("delegate_to_anything"))
    expect(result.success).toBe(false)
  })
})
