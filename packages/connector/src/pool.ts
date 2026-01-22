import { createHash } from "crypto"
import pg from "pg"
import mysql from "mysql2/promise"

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
  sslVerification: "full" | "verify_ca" | "skip_ca"
  caCertificate: string | null
  clientCertificate: string | null
  clientKey: string | null
}

export interface PooledClient {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>
  release(): void
}

const pgPools = new Map<string, pg.Pool>()
const mysqlPools = new Map<string, mysql.Pool>()

const CONNECTION_TIMEOUT_MS = 30000
const STATEMENT_TIMEOUT_MS = 600000

function configKey(config: DatabaseConfig): string {
  const hash = createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16)
  return `${config.host}:${config.port}:${config.database}:${config.user}:${hash}`
}

export async function acquire(type: "postgres" | "mysql", config: DatabaseConfig): Promise<PooledClient> {
  if (type === "postgres") {
    return acquirePostgres(config)
  }
  return acquireMysql(config)
}

async function acquirePostgres(config: DatabaseConfig): Promise<PooledClient> {
  const key = configKey(config)

  if (!pgPools.has(key)) {
    const pool = new pg.Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl
        ? {
            rejectUnauthorized: config.sslVerification !== "skip_ca",
            checkServerIdentity: config.sslVerification === "verify_ca" ? () => undefined : undefined,
            ca: config.caCertificate ?? undefined,
            cert: config.clientCertificate ?? undefined,
            key: config.clientKey ?? undefined,
          }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      query_timeout: STATEMENT_TIMEOUT_MS,
    })

    pool.on("error", (err) => {
      console.error(`[Pool ${key}] Unexpected error:`, err.message)
    })

    pgPools.set(key, pool)
  }

  const pool = pgPools.get(key)!
  const client = await pool.connect()

  return {
    query: async (sql: string, params: unknown[]) => {
      const result = await client.query({ text: sql, values: params })
      return { rows: result.rows, rowCount: result.rowCount }
    },
    release: () => client.release(),
  }
}

async function acquireMysql(config: DatabaseConfig): Promise<PooledClient> {
  const key = configKey(config)

  if (!mysqlPools.has(key)) {
    const pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl
        ? ({
            rejectUnauthorized: config.sslVerification !== "skip_ca",
            checkServerIdentity: config.sslVerification === "verify_ca" ? () => undefined : undefined,
            ca: config.caCertificate ?? undefined,
            cert: config.clientCertificate ?? undefined,
            key: config.clientKey ?? undefined,
          } as mysql.SslOptions)
        : undefined,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    })

    mysqlPools.set(key, pool)
  }

  const pool = mysqlPools.get(key)!
  const connection = await pool.getConnection()

  return {
    query: async (sql: string, params: unknown[]) => {
      const [rows] = await connection.query({ sql, values: params, timeout: STATEMENT_TIMEOUT_MS })
      if (Array.isArray(rows)) return { rows: rows as unknown[], rowCount: rows.length }
      const isPacket = rows && typeof rows === "object" && "affectedRows" in (rows as any)
      const affected = isPacket ? Number((rows as any).affectedRows ?? 0) : 0
      const payload = rows === undefined ? [] : [rows]
      return { rows: payload as unknown[], rowCount: affected }
    },
    release: () => connection.release(),
  }
}

export async function invalidateAll(): Promise<void> {
  for (const [key, pool] of pgPools) {
    await pool.end()
    pgPools.delete(key)
  }

  for (const [key, pool] of mysqlPools) {
    await pool.end()
    mysqlPools.delete(key)
  }
}

export function stats(): { postgres: number; mysql: number } {
  return {
    postgres: pgPools.size,
    mysql: mysqlPools.size,
  }
}
