import { describe, test, expect } from "vitest"
import { getSystemTools, OUTPUT_TOOLS, HUMAN_TOOLS, COMPLETION_TOOLS, type SubagentConfig } from "../system-tools"
import { MAX_SUBAGENT_DEPTH } from "../types/system-tool"

describe("getSystemTools", () => {
  const mockSubagent: SubagentConfig = {
    agentId: "agent-1",
    alias: "testAgent",
    description: "Test agent for delegation",
    versionMode: "current",
  }

  describe("output tools availability", () => {
    test("depth=0: OUTPUT_TOOLS are included", () => {
      const tools = getSystemTools(0, MAX_SUBAGENT_DEPTH, [])
      const outputToolNames = OUTPUT_TOOLS.map((t) => t.name)
      for (const name of outputToolNames) {
        expect(tools.some((t) => t.name === name)).toBe(true)
      }
    })

    test("depth=1: OUTPUT_TOOLS are NOT included", () => {
      const tools = getSystemTools(1, MAX_SUBAGENT_DEPTH, [])
      const outputToolNames = OUTPUT_TOOLS.map((t) => t.name)
      for (const name of outputToolNames) {
        expect(tools.some((t) => t.name === name)).toBe(false)
      }
    })

    test("depth=0: output_table is available", () => {
      const tools = getSystemTools(0, MAX_SUBAGENT_DEPTH, [])
      expect(tools.some((t) => t.name === "output_table")).toBe(true)
    })

    test("depth=1: output_table is NOT available", () => {
      const tools = getSystemTools(1, MAX_SUBAGENT_DEPTH, [])
      expect(tools.some((t) => t.name === "output_table")).toBe(false)
    })
  })

  describe("completion tools", () => {
    test("depth=0: task_complete is available", () => {
      const tools = getSystemTools(0, MAX_SUBAGENT_DEPTH, [])
      expect(tools.some((t) => t.name === "task_complete")).toBe(true)
    })

    test("depth=0: return_to_parent is NOT available", () => {
      const tools = getSystemTools(0, MAX_SUBAGENT_DEPTH, [])
      expect(tools.some((t) => t.name === "return_to_parent")).toBe(false)
    })

    test("depth=1: return_to_parent is available", () => {
      const tools = getSystemTools(1, MAX_SUBAGENT_DEPTH, [])
      expect(tools.some((t) => t.name === "return_to_parent")).toBe(true)
    })

    test("depth=1: task_complete is NOT available", () => {
      const tools = getSystemTools(1, MAX_SUBAGENT_DEPTH, [])
      expect(tools.some((t) => t.name === "task_complete")).toBe(false)
    })
  })

  describe("delegation tools", () => {
    test("depth < maxSubagentDepth: delegation tools are included", () => {
      const tools = getSystemTools(0, MAX_SUBAGENT_DEPTH, [mockSubagent])
      expect(tools.some((t) => t.name === "delegate_to_testAgent")).toBe(true)
    })

    test("depth >= maxSubagentDepth: delegation tools are NOT included", () => {
      const tools = getSystemTools(1, MAX_SUBAGENT_DEPTH, [mockSubagent])
      expect(tools.some((t) => t.name === "delegate_to_testAgent")).toBe(false)
    })

    test("no subagents: no delegation tools regardless of depth", () => {
      const tools = getSystemTools(0, MAX_SUBAGENT_DEPTH, [])
      expect(tools.some((t) => t.name.startsWith("delegate_to_"))).toBe(false)
    })

    test("multiple subagents: all delegation tools are included at depth=0", () => {
      const subagents: SubagentConfig[] = [
        mockSubagent,
        { agentId: "agent-2", alias: "anotherAgent", description: "Another agent", versionMode: "current" },
      ]
      const tools = getSystemTools(0, MAX_SUBAGENT_DEPTH, subagents)
      expect(tools.some((t) => t.name === "delegate_to_testAgent")).toBe(true)
      expect(tools.some((t) => t.name === "delegate_to_anotherAgent")).toBe(true)
    })
  })

  describe("human tools", () => {
    test("human_request is always available", () => {
      const toolsDepth0 = getSystemTools(0, MAX_SUBAGENT_DEPTH, [])
      const toolsDepth1 = getSystemTools(1, MAX_SUBAGENT_DEPTH, [])
      expect(toolsDepth0.some((t) => t.name === "human_request")).toBe(true)
      expect(toolsDepth1.some((t) => t.name === "human_request")).toBe(true)
    })
  })

  describe("MAX_SUBAGENT_DEPTH constant", () => {
    test("MAX_SUBAGENT_DEPTH is 1", () => {
      expect(MAX_SUBAGENT_DEPTH).toBe(1)
    })

    test("depth=2 with maxSubagentDepth=2: delegation tools are included at depth=1", () => {
      const tools = getSystemTools(1, 2, [mockSubagent])
      expect(tools.some((t) => t.name === "delegate_to_testAgent")).toBe(true)
    })

    test("depth=2 with maxSubagentDepth=2: delegation tools are NOT included at depth=2", () => {
      const tools = getSystemTools(2, 2, [mockSubagent])
      expect(tools.some((t) => t.name === "delegate_to_testAgent")).toBe(false)
    })
  })
})
