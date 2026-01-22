import { createHash } from "crypto"
import pg from "pg"
import mysql from "mysql2/promise"
import { PoolManager } from "./pool-manager"
import type { DatabaseResource, PostgresResource, MysqlResource, PooledClient } from "./types"

const pgManager = new PoolManager<pg.Pool>(
  async (pool) => pool.end(),
  (key) => removePoolKey(key),
)
const mysqlManager = new PoolManager<mysql.Pool>(
  async (pool) => pool.end(),
  (key) => removePoolKey(key),
)
const resourceToPoolKey = new Map<string, string>()
const poolKeyToResources = new Map<string, Set<string>>()

const CONNECTION_TIMEOUT_MS = 30000
const STATEMENT_TIMEOUT_MS = 600000

function normalizePostgresKey(config: PostgresResource["config"]): string {
  const hash = createHash("sha256")
    .update(`${config.host}:${config.port}/${config.database}:${config.user}`)
    .update(config.password)
    .update(config.ssl ? "ssl" : "nossl")
    .update(config.sslVerification ?? "")
    .update(config.caCertificate ?? "")
    .update(config.clientCertificate ?? "")
    .update(config.clientKey ?? "")
    .digest("hex")
    .slice(0, 16)
  return `pg:${hash}`
}

function normalizeMysqlKey(config: MysqlResource["config"]): string {
  const hash = createHash("sha256")
    .update(`${config.host}:${config.port}/${config.database}:${config.user}`)
    .update(config.password)
    .update(config.ssl ? "ssl" : "nossl")
    .update(config.sslVerification ?? "")
    .update(config.caCertificate ?? "")
    .update(config.clientCertificate ?? "")
    .update(config.clientKey ?? "")
    .digest("hex")
    .slice(0, 16)
  return `mysql:${hash}`
}

function removePoolKey(poolKey: string): void {
  const resources = poolKeyToResources.get(poolKey)
  if (!resources) return
  for (const mapKey of resources) {
    resourceToPoolKey.delete(mapKey)
  }
  poolKeyToResources.delete(poolKey)
}

async function removePoolByKey(poolKey: string): Promise<void> {
  if (poolKey.startsWith("pg:")) {
    await pgManager.remove(poolKey)
    return
  }
  if (poolKey.startsWith("mysql:")) {
    await mysqlManager.remove(poolKey)
  }
}

async function trackPoolKey(mapKey: string, poolKey: string): Promise<void> {
  const previous = resourceToPoolKey.get(mapKey)
  if (previous && previous !== poolKey) {
    const prevSet = poolKeyToResources.get(previous)
    if (prevSet) {
      prevSet.delete(mapKey)
      if (!prevSet.size) {
        poolKeyToResources.delete(previous)
        await removePoolByKey(previous)
      }
    }
  }

  resourceToPoolKey.set(mapKey, poolKey)
  let set = poolKeyToResources.get(poolKey)
  if (!set) {
    set = new Set<string>()
    poolKeyToResources.set(poolKey, set)
  }
  set.add(mapKey)
}

export async function acquire(
  resourceId: string,
  environmentId: string,
  resource: DatabaseResource,
): Promise<PooledClient> {
  if (resource.type === "postgres") {
    return acquirePostgres(resourceId, environmentId, resource)
  }

  if (resource.type === "mysql") {
    return acquireMysql(resourceId, environmentId, resource)
  }

  throw new Error(`Unsupported database type: ${(resource as DatabaseResource).type}`)
}

async function acquirePostgres(
  resourceId: string,
  environmentId: string,
  resource: PostgresResource,
): Promise<PooledClient> {
  const { config } = resource
  const key = normalizePostgresKey(config)
  await trackPoolKey(`${resourceId}:${environmentId}`, key)

  let pool = pgManager.hold(key)
  const created = !pool
  if (!pool) {
    pool = new pg.Pool({
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

    await pgManager.set(key, pool, 1)
  }

  const client = await pool.connect().catch(async (err) => {
    if (created) {
      await pgManager.remove(key)
      throw err
    }
    pgManager.release(key)
    throw err
  })

  return {
    query: async (sql: string, params: unknown[]) => {
      const result = await client.query({ text: sql, values: params })
      return { rows: result.rows, rowCount: result.rowCount }
    },
    release: () => {
      client.release()
      pgManager.release(key)
    },
  }
}

async function acquireMysql(resourceId: string, environmentId: string, resource: MysqlResource): Promise<PooledClient> {
  const { config } = resource
  const key = normalizeMysqlKey(config)
  await trackPoolKey(`${resourceId}:${environmentId}`, key)

  let pool = mysqlManager.hold(key)
  const created = !pool
  if (!pool) {
    pool = mysql.createPool({
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

    await mysqlManager.set(key, pool, 1)
  }

  const connection = await pool.getConnection().catch(async (err) => {
    if (created) {
      await mysqlManager.remove(key)
      throw err
    }
    mysqlManager.release(key)
    throw err
  })

  return {
    query: async (sql: string, params: unknown[]) => {
      const [rows] = await connection.query({ sql, values: params, timeout: STATEMENT_TIMEOUT_MS })
      if (Array.isArray(rows)) return { rows: rows as unknown[], rowCount: rows.length }
      const isPacket = rows && typeof rows === "object" && "affectedRows" in (rows as any)
      const affected = isPacket ? Number((rows as any).affectedRows ?? 0) : 0
      const payload = rows === undefined ? [] : [rows]
      return { rows: payload as unknown[], rowCount: affected }
    },
    release: () => {
      connection.release()
      mysqlManager.release(key)
    },
  }
}

export async function invalidate(resourceId: string, environmentId: string): Promise<void> {
  const mapKey = `${resourceId}:${environmentId}`
  const poolKey = resourceToPoolKey.get(mapKey)
  if (!poolKey) return

  resourceToPoolKey.delete(mapKey)

  const set = poolKeyToResources.get(poolKey)
  if (!set) {
    await removePoolByKey(poolKey)
    return
  }

  set.delete(mapKey)
  if (set.size) return
  poolKeyToResources.delete(poolKey)
  await removePoolByKey(poolKey)
}

export async function invalidateAll(): Promise<void> {
  await pgManager.shutdown()
  await mysqlManager.shutdown()
  resourceToPoolKey.clear()
  poolKeyToResources.clear()
}

export function stats(): { postgres: number; mysql: number } {
  const pgStats = pgManager.stats()
  const mysqlStats = mysqlManager.stats()
  return {
    postgres: pgStats.count,
    mysql: mysqlStats.count,
  }
}
