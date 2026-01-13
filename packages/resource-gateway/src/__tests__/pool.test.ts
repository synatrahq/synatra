import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockPgPool = {
  connect: vi.fn(),
  on: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
}

const mockMysqlPool = {
  getConnection: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
}

const mockPgCtor = vi.fn()
const mockMysqlCtor = vi.fn(() => mockMysqlPool)

function MockPgPool() {
  mockPgCtor()
  return mockPgPool
}

vi.mock("pg", () => ({
  default: {
    Pool: MockPgPool,
  },
}))

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: mockMysqlCtor,
  },
}))

vi.mock("../config", () => ({
  config: () => ({
    pool: { maxPools: 10, idleTtlMs: 300000 },
  }),
}))

describe("pool", () => {
  let pool: typeof import("../pool") | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.clearAllMocks()
    mockPgPool.connect.mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    })
    mockMysqlPool.getConnection.mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    })
  })

  afterEach(async () => {
    if (pool) {
      await pool.invalidateAll()
    }
    pool = null
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it("keeps shared pool until last invalidate", async () => {
    pool = await import("../pool")

    const resource = {
      type: "postgres",
      config: {
        host: "localhost",
        port: 5432,
        database: "db",
        user: "user",
        password: "pass",
        ssl: false,
        sslVerification: "full",
        caCertificate: null,
        clientCertificate: null,
      },
    } as any

    const client1 = await pool.acquire("r1", "e1", resource)
    client1.release()
    const client2 = await pool.acquire("r2", "e1", resource)
    client2.release()

    await pool.invalidate("r1", "e1")
    expect(mockPgPool.end).not.toHaveBeenCalled()

    await pool.invalidate("r2", "e1")
    expect(mockPgPool.end).toHaveBeenCalledTimes(1)
  })
})
