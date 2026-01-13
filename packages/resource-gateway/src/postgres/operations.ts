import { z } from "zod"
import * as pool from "../pool"
import type { PostgresResource } from "../types"

export const postgresOperation = z.object({
  type: z.literal("postgres"),
  sql: z.string(),
  params: z.array(z.unknown()).optional(),
})

export type PostgresOperation = z.infer<typeof postgresOperation>

interface OperationResult {
  data: unknown
  rowCount?: number
}

export async function executePostgresOperation(
  resourceId: string,
  environmentId: string,
  resource: PostgresResource,
  operation: PostgresOperation,
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
  resource: PostgresResource,
): Promise<TableInfo[]> {
  const client = await pool.acquire(resourceId, environmentId, resource)
  try {
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
  } finally {
    client.release()
  }
}

export async function listColumns(
  resourceId: string,
  environmentId: string,
  resource: PostgresResource,
  table: string,
  schema?: string,
): Promise<ColumnInfo[]> {
  const client = await pool.acquire(resourceId, environmentId, resource)
  const schemaName = schema ?? "public"
  try {
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
  } finally {
    client.release()
  }
}
