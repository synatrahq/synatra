import * as pool from "./pool"
import type { DatabaseConfig } from "./pool"

export interface QueryCommand {
  resourceType: "postgres" | "mysql"
  config: DatabaseConfig
  sql: string
  params?: unknown[]
}

export interface IntrospectCommand {
  resourceType: "postgres" | "mysql"
  config: DatabaseConfig
  operation: "tables" | "columns"
  table?: string
  schema?: string
}

export interface TestCommand {
  resourceType: "postgres" | "mysql"
  config: DatabaseConfig
}

export interface RestApiTestCommand {
  resourceType: "restapi"
  config: {
    baseUrl: string
    auth:
      | { type: "none" }
      | { type: "api_key"; key: string; location: "header" | "query"; name: string }
      | { type: "bearer"; token: string }
      | { type: "basic"; username: string; password: string }
    headers: Record<string, string>
    queryParams: Record<string, string>
  }
}

export interface RestApiCommand {
  resourceType: "restapi"
  config: {
    baseUrl: string
    auth:
      | { type: "none" }
      | { type: "api_key"; key: string; location: "header" | "query"; name: string }
      | { type: "bearer"; token: string }
      | { type: "basic"; username: string; password: string }
    headers: Record<string, string>
    queryParams: Record<string, string>
  }
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  headers?: Record<string, string>
  queryParams?: Record<string, string>
  body?: unknown
}

export interface RestApiResult {
  data: unknown
}

export interface QueryResult {
  data: unknown
  rowCount?: number
}

export interface TableInfo {
  schema: string
  name: string
  type: "table" | "view"
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  isUnique: boolean
  isAutoIncrement: boolean
  defaultValue: string | null
  comment: string | null
  maxLength: number | null
  numericPrecision: number | null
  numericScale: number | null
  foreignKey: { table: string; column: string } | null
}

export async function executeQuery(cmd: QueryCommand): Promise<QueryResult> {
  const client = await pool.acquire(cmd.resourceType, cmd.config)
  try {
    const result = await client.query(cmd.sql, cmd.params ?? [])
    return { data: result.rows, rowCount: result.rowCount ?? undefined }
  } finally {
    client.release()
  }
}

export async function executeIntrospect(cmd: IntrospectCommand): Promise<QueryResult> {
  if (cmd.operation === "tables") {
    const tables = await listTables(cmd.resourceType, cmd.config)
    return { data: tables }
  }
  if (!cmd.table) throw new Error("table is required for columns operation")
  const columns = await listColumns(cmd.resourceType, cmd.config, cmd.table, cmd.schema)
  return { data: columns }
}

function formatConnectionError(error: unknown, host: string): string {
  const msg = error instanceof Error ? error.message : String(error)

  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return `Cannot resolve hostname "${host}"`
  }
  if (msg.includes("ECONNREFUSED")) {
    return `Connection refused to ${host}`
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
    return `Connection timed out to ${host}`
  }
  if (msg.includes("authentication failed") || msg.includes("password")) {
    return `Authentication failed`
  }

  return msg
}

export async function executeTest(cmd: TestCommand): Promise<{ success: boolean; error?: string; latency?: number }> {
  const start = Date.now()
  try {
    const client = await pool.acquire(cmd.resourceType, cmd.config)
    try {
      await client.query("SELECT 1", [])
      return { success: true, latency: Date.now() - start }
    } finally {
      client.release()
    }
  } catch (error) {
    return {
      success: false,
      error: formatConnectionError(error, cmd.config.host),
      latency: Date.now() - start,
    }
  }
}

export async function executeRestApiTest(
  cmd: RestApiTestCommand,
): Promise<{ success: boolean; error?: string; latency?: number }> {
  const start = Date.now()
  try {
    const url = new URL(cmd.config.baseUrl)

    for (const [key, value] of Object.entries(cmd.config.queryParams ?? {})) {
      url.searchParams.set(key, value)
    }

    const headers: Record<string, string> = { ...(cmd.config.headers ?? {}) }

    if (cmd.config.auth.type === "api_key") {
      if (cmd.config.auth.location === "header") {
        headers[cmd.config.auth.name] = cmd.config.auth.key
      } else {
        url.searchParams.set(cmd.config.auth.name, cmd.config.auth.key)
      }
    } else if (cmd.config.auth.type === "bearer") {
      headers["Authorization"] = `Bearer ${cmd.config.auth.token}`
    } else if (cmd.config.auth.type === "basic") {
      const encoded = Buffer.from(`${cmd.config.auth.username}:${cmd.config.auth.password}`).toString("base64")
      headers["Authorization"] = `Basic ${encoded}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RESTAPI_TIMEOUT_MS)

    const response = await fetch(url.toString(), {
      method: "HEAD",
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    if (!response.ok && response.status !== 405) {
      return { success: false, error: `HTTP ${response.status}`, latency: Date.now() - start }
    }

    return { success: true, latency: Date.now() - start }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: `Request timeout after ${RESTAPI_TIMEOUT_MS}ms`, latency: Date.now() - start }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latency: Date.now() - start,
    }
  }
}

async function listTables(type: "postgres" | "mysql", config: DatabaseConfig): Promise<TableInfo[]> {
  const client = await pool.acquire(type, config)
  try {
    if (type === "postgres") {
      const result = await client.query(
        `SELECT
          table_schema as schema,
          table_name as name,
          CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name`,
        [],
      )
      return result.rows as TableInfo[]
    }

    const result = await client.query(
      `SELECT
        TABLE_SCHEMA as \`schema\`,
        TABLE_NAME as name,
        CASE TABLE_TYPE WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME`,
      [],
    )
    return result.rows as TableInfo[]
  } finally {
    client.release()
  }
}

async function listColumns(
  type: "postgres" | "mysql",
  config: DatabaseConfig,
  table: string,
  schema?: string,
): Promise<ColumnInfo[]> {
  const client = await pool.acquire(type, config)
  try {
    if (type === "postgres") {
      const schemaName = schema ?? "public"
      const result = await client.query(
        `SELECT
          c.column_name as name,
          c.data_type as type,
          c.is_nullable = 'YES' as nullable,
          COALESCE(pk.is_pk, false) as "isPrimaryKey",
          COALESCE(uq.is_unique, false) as "isUnique",
          COALESCE(c.column_default LIKE 'nextval(%', false) as "isAutoIncrement",
          c.column_default as "defaultValue",
          pd.description as comment,
          c.character_maximum_length as "maxLength",
          c.numeric_precision as "numericPrecision",
          c.numeric_scale as "numericScale",
          fk.foreign_table as "fkTable",
          fk.foreign_column as "fkColumn"
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name, true as is_pk
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
        ) pk ON pk.column_name = c.column_name
        LEFT JOIN (
          SELECT kcu.column_name, true as is_unique
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = $1 AND tc.table_name = $2
        ) uq ON uq.column_name = c.column_name
        LEFT JOIN (
          SELECT kcu.column_name, ccu.table_name as foreign_table, ccu.column_name as foreign_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
        ) fk ON fk.column_name = c.column_name
        LEFT JOIN pg_catalog.pg_statio_all_tables st
          ON st.schemaname = c.table_schema AND st.relname = c.table_name
        LEFT JOIN pg_catalog.pg_description pd
          ON pd.objoid = st.relid AND pd.objsubid = c.ordinal_position
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position`,
        [schemaName, table],
      )
      return (result.rows as Record<string, unknown>[]).map((row) => ({
        ...row,
        foreignKey: row.fkTable ? { table: row.fkTable as string, column: row.fkColumn as string } : null,
      })) as ColumnInfo[]
    }

    const result = await client.query(
      `SELECT
        c.COLUMN_NAME as name,
        c.DATA_TYPE as type,
        c.IS_NULLABLE = 'YES' as nullable,
        c.COLUMN_KEY = 'PRI' as isPrimaryKey,
        c.COLUMN_KEY = 'UNI' as isUnique,
        c.EXTRA LIKE '%auto_increment%' as isAutoIncrement,
        c.COLUMN_DEFAULT as defaultValue,
        c.COLUMN_COMMENT as comment,
        c.CHARACTER_MAXIMUM_LENGTH as maxLength,
        c.NUMERIC_PRECISION as numericPrecision,
        c.NUMERIC_SCALE as numericScale,
        fk.REFERENCED_TABLE_NAME as fkTable,
        fk.REFERENCED_COLUMN_NAME as fkColumn
      FROM information_schema.COLUMNS c
      LEFT JOIN information_schema.KEY_COLUMN_USAGE fk
        ON fk.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND fk.TABLE_NAME = c.TABLE_NAME
        AND fk.COLUMN_NAME = c.COLUMN_NAME
        AND fk.REFERENCED_TABLE_NAME IS NOT NULL
      WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = ?
      ORDER BY c.ORDINAL_POSITION`,
      [table],
    )
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      ...row,
      foreignKey: row.fkTable ? { table: row.fkTable as string, column: row.fkColumn as string } : null,
    })) as ColumnInfo[]
  } finally {
    client.release()
  }
}

const RESTAPI_TIMEOUT_MS = 30000

export async function executeRestApi(cmd: RestApiCommand): Promise<RestApiResult> {
  const url = new URL(cmd.path, cmd.config.baseUrl)

  const allQueryParams = { ...(cmd.config.queryParams ?? {}), ...(cmd.queryParams ?? {}) }
  for (const [key, value] of Object.entries(allQueryParams)) {
    url.searchParams.set(key, value)
  }

  if (cmd.config.auth.type === "api_key" && cmd.config.auth.location === "query") {
    url.searchParams.set(cmd.config.auth.name, cmd.config.auth.key)
  }

  const headers: Record<string, string> = { ...(cmd.config.headers ?? {}), ...(cmd.headers ?? {}) }

  if (cmd.config.auth.type === "api_key" && cmd.config.auth.location === "header") {
    headers[cmd.config.auth.name] = cmd.config.auth.key
  } else if (cmd.config.auth.type === "bearer") {
    headers["Authorization"] = `Bearer ${cmd.config.auth.token}`
  } else if (cmd.config.auth.type === "basic") {
    const encoded = Buffer.from(`${cmd.config.auth.username}:${cmd.config.auth.password}`).toString("base64")
    headers["Authorization"] = `Basic ${encoded}`
  }

  if (cmd.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RESTAPI_TIMEOUT_MS)

  try {
    const response = await fetch(url.toString(), {
      method: cmd.method,
      headers,
      body: cmd.body ? JSON.stringify(cmd.body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    const contentType = response.headers.get("content-type") || ""
    let data: unknown

    if (contentType.includes("application/json")) {
      data = await response.json()
    } else if (response.status === 204 || response.headers.get("content-length") === "0") {
      data = null
    } else {
      data = await response.text()
    }

    return { data }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${RESTAPI_TIMEOUT_MS}ms`)
    }
    throw error
  }
}
