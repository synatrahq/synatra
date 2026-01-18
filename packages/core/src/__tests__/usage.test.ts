import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { currentYearMonth, yearMonthToPeriod } from "../usage"

describe("Usage.currentYearMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("returns correct yearMonth format", () => {
    vi.setSystemTime(new Date("2025-03-15T10:30:00Z"))
    expect(currentYearMonth()).toBe(202503)
  })

  test("handles January correctly", () => {
    vi.setSystemTime(new Date("2025-01-15T10:30:00Z"))
    expect(currentYearMonth()).toBe(202501)
  })

  test("handles December correctly", () => {
    vi.setSystemTime(new Date("2025-12-20T10:30:00Z"))
    expect(currentYearMonth()).toBe(202512)
  })

  test("handles year boundary", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    expect(currentYearMonth()).toBe(202601)
  })
})

describe("Usage.yearMonthToPeriod", () => {
  test("converts yearMonth to correct period start", () => {
    const { start } = yearMonthToPeriod(202503)
    expect(start.toISOString()).toBe("2025-03-01T00:00:00.000Z")
  })

  test("converts yearMonth to correct period end", () => {
    const { end } = yearMonthToPeriod(202503)
    expect(end.toISOString()).toBe("2025-04-01T00:00:00.000Z")
  })

  test("handles year boundary (December)", () => {
    const { start, end } = yearMonthToPeriod(202512)
    expect(start.toISOString()).toBe("2025-12-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2026-01-01T00:00:00.000Z")
  })

  test("handles January", () => {
    const { start, end } = yearMonthToPeriod(202501)
    expect(start.toISOString()).toBe("2025-01-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2025-02-01T00:00:00.000Z")
  })
})
