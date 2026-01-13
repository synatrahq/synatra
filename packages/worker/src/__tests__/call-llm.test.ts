import { test, expect, vi } from "vitest"

vi.mock("ai", () => ({
  generateText: ({ abortSignal }: { abortSignal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      const err = new Error("Aborted")
      err.name = "AbortError"

      if (!abortSignal) {
        reject(new Error("Missing abort signal"))
        return
      }

      if (abortSignal.aborted) {
        reject(err)
        return
      }

      const onAbort = () => {
        abortSignal.removeEventListener("abort", onAbort)
        clearTimeout(timer)
        reject(err)
      }

      const timer = setTimeout(() => {
        abortSignal.removeEventListener("abort", onAbort)
        reject(new Error("Abort did not trigger"))
      }, 50)

      abortSignal.addEventListener("abort", onAbort)
    }),
  tool: (input: { description: string; inputSchema: unknown }) => input,
  jsonSchema: (schema: unknown) => schema,
}))

const { callLLM } = await import("../activities/call-llm")

test("callLLM returns timeout result when aborted", async () => {
  const res = await callLLM({
    agentConfig: {
      model: { provider: "openai", model: "gpt-4o-mini", temperature: 0 },
      systemPrompt: "",
      tools: [],
    },
    messages: [{ role: "user", content: "hi" }],
    timeoutMs: 1,
    llmConfig: { apiKey: "test-api-key", baseUrl: null },
  })

  expect(res.type).toBe("error")
  if (res.type !== "error") throw new Error("expected error")
  expect(res.reason).toBe("timeout")
  expect(res.error).toBe("LLM request timed out")
  expect(typeof res.durationMs).toBe("number")
})
