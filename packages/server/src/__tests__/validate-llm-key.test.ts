import { describe, test, expect, vi, beforeEach } from "vitest"

const mockFetch = vi.fn()
global.fetch = mockFetch

type ValidationResult = { valid: true } | { valid: false; error: string }

async function parseError(res: Response, authErrorCodes: number[]): Promise<ValidationResult> {
  if (authErrorCodes.includes(res.status)) return { valid: false, error: "Invalid API key" }
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  return { valid: false, error: body?.error?.message || `Request failed with status ${res.status}` }
}

async function validateOpenAI(apiKey: string, baseUrl: string): Promise<ValidationResult> {
  const res = await fetch(`${baseUrl}/v1/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (res.ok) return { valid: true }
  return parseError(res, [401])
}

async function validateAnthropic(apiKey: string, baseUrl: string): Promise<ValidationResult> {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  })
  if (res.ok) return { valid: true }
  return parseError(res, [401])
}

async function validateGoogle(apiKey: string, baseUrl: string): Promise<ValidationResult> {
  const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`, { method: "GET" })
  if (res.ok) return { valid: true }
  return parseError(res, [400, 401])
}

describe("validate-llm-key", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("parseError", () => {
    test("returns Invalid API key for auth error codes", async () => {
      const res = { status: 401, json: () => Promise.resolve({}) } as Response
      const result = await parseError(res, [401])
      expect(result).toEqual({ valid: false, error: "Invalid API key" })
    })

    test("returns error message from API response", async () => {
      const res = {
        status: 500,
        json: () => Promise.resolve({ error: { message: "Rate limit exceeded" } }),
      } as Response
      const result = await parseError(res, [401])
      expect(result).toEqual({ valid: false, error: "Rate limit exceeded" })
    })

    test("returns status code when JSON parsing fails", async () => {
      const res = {
        status: 503,
        json: () => Promise.reject(new Error("Invalid JSON")),
      } as Response
      const result = await parseError(res, [401])
      expect(result).toEqual({ valid: false, error: "Request failed with status 503" })
    })

    test("returns status code when error message is missing", async () => {
      const res = { status: 502, json: () => Promise.resolve({}) } as Response
      const result = await parseError(res, [401])
      expect(result).toEqual({ valid: false, error: "Request failed with status 502" })
    })
  })

  describe("validateOpenAI", () => {
    test("returns valid for successful response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await validateOpenAI("sk-test", "https://api.openai.com")

      expect(result).toEqual({ valid: true })
      expect(mockFetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: "Bearer sk-test" },
      })
    })

    test("returns invalid for 401 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      })

      const result = await validateOpenAI("invalid", "https://api.openai.com")

      expect(result).toEqual({ valid: false, error: "Invalid API key" })
    })

    test("uses custom baseUrl", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await validateOpenAI("sk-test", "https://custom.api.com")

      expect(mockFetch).toHaveBeenCalledWith("https://custom.api.com/v1/models", expect.any(Object))
    })

    test("returns API error message for non-auth errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: "Rate limit exceeded" } }),
      })

      const result = await validateOpenAI("sk-test", "https://api.openai.com")

      expect(result).toEqual({ valid: false, error: "Rate limit exceeded" })
    })
  })

  describe("validateAnthropic", () => {
    test("returns valid for successful response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await validateAnthropic("sk-ant-test", "https://api.anthropic.com")

      expect(result).toEqual({ valid: true })
      expect(mockFetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": "sk-ant-test",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: expect.any(String),
      })
    })

    test("returns invalid for 401 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      })

      const result = await validateAnthropic("invalid", "https://api.anthropic.com")

      expect(result).toEqual({ valid: false, error: "Invalid API key" })
    })

    test("sends minimal request body", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await validateAnthropic("sk-ant-test", "https://api.anthropic.com")

      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1].body)
      expect(body).toEqual({
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      })
    })
  })

  describe("validateGoogle", () => {
    test("returns valid for successful response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await validateGoogle("AIza-test", "https://generativelanguage.googleapis.com")

      expect(result).toEqual({ valid: true })
      expect(mockFetch).toHaveBeenCalledWith("https://generativelanguage.googleapis.com/v1beta/models?key=AIza-test", {
        method: "GET",
      })
    })

    test("returns invalid for 400 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      })

      const result = await validateGoogle("invalid", "https://generativelanguage.googleapis.com")

      expect(result).toEqual({ valid: false, error: "Invalid API key" })
    })

    test("returns invalid for 401 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      })

      const result = await validateGoogle("invalid", "https://generativelanguage.googleapis.com")

      expect(result).toEqual({ valid: false, error: "Invalid API key" })
    })

    test("includes API key in query parameter", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await validateGoogle("my-api-key", "https://generativelanguage.googleapis.com")

      expect(mockFetch).toHaveBeenCalledWith("https://generativelanguage.googleapis.com/v1beta/models?key=my-api-key", {
        method: "GET",
      })
    })
  })
})
