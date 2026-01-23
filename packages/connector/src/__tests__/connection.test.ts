import { afterEach, beforeEach, expect, test } from "bun:test"
import { connect, disconnect, maskTokens } from "../connection"

type TimerEntry = {
  id: number
  time: number
  fn: () => void
}

let now = 0
let timers: TimerEntry[] = []
let nextId = 1
let originalSetTimeout: typeof setTimeout
let originalClearTimeout: typeof clearTimeout
let originalSetInterval: typeof setInterval
let originalClearInterval: typeof clearInterval
let originalDateNow: typeof Date.now
let originalRandom: typeof Math.random
let OriginalWebSocket: typeof WebSocket

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  url: string
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string | { text: () => Promise<string> } }) => void) | null = null
  onclose: ((event: { code: number; reason?: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(msg: string): void {
    this.sent.push(msg)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  close(code = 1000, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }
}

function runDueTimers(): void {
  timers.sort((a, b) => a.time - b.time)
  while (timers.length > 0 && timers[0].time <= now) {
    const next = timers.shift()
    if (!next) return
    next.fn()
    timers.sort((a, b) => a.time - b.time)
  }
}

function advance(ms: number): void {
  now += ms
  runDueTimers()
}

function advanceToNextTimer(): void {
  timers.sort((a, b) => a.time - b.time)
  const next = timers[0]
  if (!next) return
  now = next.time
  runDueTimers()
}

function sendShutdownNotice(socket: MockWebSocket): void {
  const msg = JSON.stringify({
    type: "shutdown_notice",
    correlationId: "test",
    payload: { gracePeriodMs: 1000 },
  })
  socket.onmessage?.({ data: msg })
}

beforeEach(() => {
  now = 0
  timers = []
  nextId = 1

  originalSetTimeout = globalThis.setTimeout
  originalClearTimeout = globalThis.clearTimeout
  originalSetInterval = globalThis.setInterval
  originalClearInterval = globalThis.clearInterval
  originalDateNow = Date.now
  originalRandom = Math.random
  OriginalWebSocket = globalThis.WebSocket

  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
    const id = nextId++
    timers.push({ id, time: now + Number(delay ?? 0), fn: fn as () => void })
    return id as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    timers = timers.filter((timer) => timer.id !== Number(id))
  }) as typeof clearTimeout

  globalThis.setInterval = ((fn: (...args: unknown[]) => void, delay?: number) => {
    const id = nextId++
    return id as unknown as ReturnType<typeof setInterval>
  }) as typeof setInterval

  globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
    void id
  }) as typeof clearInterval

  Date.now = () => now
  Math.random = () => 0
  MockWebSocket.instances = []
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
})

afterEach(() => {
  disconnect()
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
  globalThis.setInterval = originalSetInterval
  globalThis.clearInterval = originalClearInterval
  Date.now = originalDateNow
  Math.random = originalRandom
  globalThis.WebSocket = OriginalWebSocket
})

test("rearms pending retry after pause", () => {
  connect({
    gatewayUrl: "ws://localhost:10000/connector/ws",
    token: "token",
    version: "test",
    platform: "test",
  })

  const main = MockWebSocket.instances[0]
  expect(main).toBeTruthy()
  main.open()

  sendShutdownNotice(main)
  const pending1 = MockWebSocket.instances[1]
  expect(pending1).toBeTruthy()
  pending1.open()
  pending1.close(1000, "fail")

  advanceToNextTimer()
  const pending2 = MockWebSocket.instances[2]
  expect(pending2).toBeTruthy()
  pending2.open()
  pending2.close(1000, "fail")

  advanceToNextTimer()
  const pending3 = MockWebSocket.instances[3]
  expect(pending3).toBeTruthy()
  pending3.open()
  pending3.close(1000, "fail")

  advanceToNextTimer()
  expect(MockWebSocket.instances.length).toBe(4)

  const countBeforePause = MockWebSocket.instances.length
  advance(60000)
  expect(MockWebSocket.instances.length).toBeGreaterThan(countBeforePause)
})

test("masks tokens in log strings", () => {
  const input =
    'wss://example.com/connector/ws?token=conn_123&x=1 Authorization: Bearer secret-token {"token":"json-secret"}'
  const masked = maskTokens(input)
  expect(masked).not.toContain("conn_123")
  expect(masked).not.toContain("secret-token")
  expect(masked).not.toContain("json-secret")
  expect(masked).toContain("token=[redacted]")
  expect(masked).toContain("Bearer [redacted]")
  expect(masked).toContain('"token":"[redacted]"')
})
