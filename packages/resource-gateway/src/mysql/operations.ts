import { z } from "zod"
import * as pool from "../pool"
import type { MysqlResource } from "../types"

export const mysqlOperation = z.object({
  type: z.literal("mysql"),
  sql: z.string(),
  params: z.array(z.unknown()).optional(),
})

export type MysqlOperation = z.infer<typeof mysqlOperation>

interface OperationResult {
  data: unknown
  rowCount?: number
}

export async function executeMysqlOperation(
  resourceId: string,
  environmentId: string,
  resource: MysqlResource,
  operation: MysqlOperation,
): Promise<OperationResult> {
  const client = await pool.acquire(resourceId, environmentId, resource)
  try {
    const result = await client.query(operation.sql, operation.params ?? [])
    return { data: result.rows, rowCount: result.rowCount ?? undefined }
  } finally {
    client.release()
  }
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

export async function listTables(
  resourceId: string,
  environmentId: string,
  resource: MysqlResource,
): Promise<TableInfo[]> {
  const client = await pool.acquire(resourceId, environmentId, resource)
  try {
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

export async function listColumns(
  resourceId: string,
  environmentId: string,
  resource: MysqlResource,
  table: string,
): Promise<ColumnInfo[]> {
  const client = await pool.acquire(resourceId, environmentId, resource)
  try {
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
    return (result.rows as Record<string, unknown>[]).map((row) => {
      const { fkTable, fkColumn, ...rest } = row
      return {
        ...rest,
        foreignKey: fkTable ? { table: fkTable as string, column: fkColumn as string } : null,
      }
    }) as ColumnInfo[]
  } finally {
    client.release()
  }
}
