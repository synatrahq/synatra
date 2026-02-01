import { test, expect, vi, beforeEach } from "vitest"

const mockExecuteCode = vi.fn()

vi.mock("../executor-client", () => ({
  executeCode: (...args: unknown[]) => mockExecuteCode(...args),
}))

const { executeCodePure } = await import("../execute-code-pure")

beforeEach(() => {
  mockExecuteCode.mockReset()
})

test("executeCodePure returns result on success", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: {
      success: true,
      result: 5050,
      logs: [["sum calculated"]],
    },
  })

  const result = await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return Array.from({length: 100}, (_, i) => i + 1).reduce((a, b) => a + b, 0)",
  })

  expect(result.success).toBe(true)
  expect(result.result).toBe(5050)
  expect(result.logs).toEqual([["sum calculated"]])
  expect(result.duration).toBeGreaterThanOrEqual(0)

  expect(mockExecuteCode).toHaveBeenCalledWith("org-1", {
    code: "return Array.from({length: 100}, (_, i) => i + 1).reduce((a, b) => a + b, 0)",
    params: {},
    context: { resources: [] },
    environmentId: "env-1",
    timeout: 10000,
  })
})

test("executeCodePure clamps timeout to minimum", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: { success: true, result: 42, logs: [] },
  })

  await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return 42",
    timeout: 50,
  })

  expect(mockExecuteCode).toHaveBeenCalledWith("org-1", expect.objectContaining({ timeout: 100 }))
})

test("executeCodePure clamps timeout to maximum", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: { success: true, result: 42, logs: [] },
  })

  await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return 42",
    timeout: 60000,
  })

  expect(mockExecuteCode).toHaveBeenCalledWith("org-1", expect.objectContaining({ timeout: 30000 }))
})

test("executeCodePure returns error when executeCode fails", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: false,
    error: {
      type: "https://synatra.io/errors/connection-error",
      title: "Connection Error",
      status: 500,
      name: "ConnectionError",
      data: {},
    },
  })

  const result = await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return 42",
  })

  expect(result.success).toBe(false)
  expect(result.error).toBe("Connection Error")
  expect(result.logs).toEqual([])
})

test("executeCodePure returns error on code execution failure", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: {
      success: false,
      error: "SyntaxError: Unexpected token",
      logs: [["parsing failed"]],
    },
  })

  const result = await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return {",
  })

  expect(result.success).toBe(false)
  expect(result.error).toBe("SyntaxError: Unexpected token")
  expect(result.logs).toEqual([["parsing failed"]])
})

test("executeCodePure passes empty resources for security", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: { success: true, result: null, logs: [] },
  })

  await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return null",
  })

  expect(mockExecuteCode).toHaveBeenCalledWith(
    "org-1",
    expect.objectContaining({
      context: { resources: [] },
    }),
  )
})

test("executeCodePure uses default timeout when not specified", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: { success: true, result: 42, logs: [] },
  })

  await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return 42",
  })

  expect(mockExecuteCode).toHaveBeenCalledWith("org-1", expect.objectContaining({ timeout: 10000 }))
})

test("executeCodePure passes params data", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: { success: true, result: "Alice", logs: [] },
  })

  const result = await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return params.name",
    params: { name: "Alice", age: 30 },
  })

  expect(result.success).toBe(true)
  expect(result.result).toBe("Alice")

  expect(mockExecuteCode).toHaveBeenCalledWith("org-1", {
    code: "return params.name",
    params: { name: "Alice", age: 30 },
    context: { resources: [] },
    environmentId: "env-1",
    timeout: 10000,
  })
})

test("executeCodePure uses empty params when not provided", async () => {
  mockExecuteCode.mockResolvedValue({
    ok: true,
    data: { success: true, result: 42, logs: [] },
  })

  await executeCodePure({
    organizationId: "org-1",
    environmentId: "env-1",
    code: "return 42",
  })

  expect(mockExecuteCode).toHaveBeenCalledWith("org-1", {
    code: "return 42",
    params: {},
    context: { resources: [] },
    environmentId: "env-1",
    timeout: 10000,
  })
})
