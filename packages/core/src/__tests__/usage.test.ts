import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { getUsageCurrentPeriod } from "../usage"

describe("Usage.getCurrentPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("returns first day of current month as start", async () => {
    vi.setSystemTime(new Date("2025-03-15T10:30:00Z"))
    const { start } = await getUsageCurrentPeriod()
    expect(start.toISOString()).toBe("2025-03-01T00:00:00.000Z")
  })

  test("returns first day of next month as end", async () => {
    vi.setSystemTime(new Date("2025-03-15T10:30:00Z"))
    const { end } = await getUsageCurrentPeriod()
    expect(end.toISOString()).toBe("2025-04-01T00:00:00.000Z")
  })

  test("handles year boundary (December)", async () => {
    vi.setSystemTime(new Date("2025-12-20T10:30:00Z"))
    const { start, end } = await getUsageCurrentPeriod()
    expect(start.toISOString()).toBe("2025-12-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2026-01-01T00:00:00.000Z")
  })

  test("handles first day of month", async () => {
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"))
    const { start, end } = await getUsageCurrentPeriod()
    expect(start.toISOString()).toBe("2025-01-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2025-02-01T00:00:00.000Z")
  })

  test("handles last day of month", async () => {
    vi.setSystemTime(new Date("2025-01-31T23:59:59Z"))
    const { start, end } = await getUsageCurrentPeriod()
    expect(start.toISOString()).toBe("2025-01-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2025-02-01T00:00:00.000Z")
  })
})
