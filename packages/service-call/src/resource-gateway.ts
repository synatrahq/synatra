import type { ServiceConfig } from "./config"
import { serviceFetch, type ServiceResult } from "./fetch"
import type { ResourceType, UserConfigurableResourceType } from "@synatra/core/types"

export type QueryOperation = {
  type: ResourceType
  [key: string]: unknown
}

export type QueryResult = {
  success: boolean
  data?: unknown
  error?: string
}

export type TableInfo = {
  schema: string
  name: string
  type: "table" | "view"
}

export type ColumnInfo = {
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

type GatewayResponse<T> = {
  success: boolean
  data: T
  message?: string
}

export type TestConnectionResult = {
  success: boolean
  error?: string
  latency?: number
}

export type TestConnectionParams = {
  type: UserConfigurableResourceType
  config: Record<string, unknown>
  connectionMode?: "direct" | "connector"
  connectorId?: string | null
}

export type ResourceGateway = {
  query: (
    organizationId: string,
    resourceId: string,
    environmentId: string,
    operation: QueryOperation,
  ) => Promise<ServiceResult<QueryResult>>
  tables: (organizationId: string, resourceId: string, environmentId: string) => Promise<ServiceResult<TableInfo[]>>
  columns: (
    organizationId: string,
    resourceId: string,
    environmentId: string,
    table: string,
    schema?: string,
  ) => Promise<ServiceResult<ColumnInfo[]>>
  testConnection: (organizationId: string, params: TestConnectionParams) => Promise<ServiceResult<TestConnectionResult>>
  invalidateConnectorToken: (
    organizationId: string,
    connectorId: string,
  ) => Promise<ServiceResult<{ success: boolean }>>
}

export function createResourceGateway(config: ServiceConfig): ResourceGateway {
  const base = config.resourceGatewayUrl

  return {
    async query(organizationId, resourceId, environmentId, operation) {
      return serviceFetch(config, `${base}/query`, { resourceId, environmentId, operation }, organizationId)
    },

    async tables(organizationId, resourceId, environmentId) {
      const result = await serviceFetch<GatewayResponse<TableInfo[]>>(
        config,
        `${base}/tables`,
        { resourceId, environmentId },
        organizationId,
      )
      if (!result.ok) return result
      if (!result.data.success) return { ok: false, error: result.data.message ?? "Unknown error" }
      return { ok: true, data: result.data.data }
    },

    async columns(organizationId, resourceId, environmentId, table, schema) {
      const result = await serviceFetch<GatewayResponse<ColumnInfo[]>>(
        config,
        `${base}/columns`,
        { resourceId, environmentId, table, schema },
        organizationId,
      )
      if (!result.ok) return result
      if (!result.data.success) return { ok: false, error: result.data.message ?? "Unknown error" }
      return { ok: true, data: result.data.data }
    },

    async testConnection(organizationId, params) {
      return serviceFetch<TestConnectionResult>(
        config,
        `${base}/test`,
        {
          type: params.type,
          config: params.config,
          connectionMode: params.connectionMode,
          connectorId: params.connectorId,
        },
        organizationId,
      )
    },

    async invalidateConnectorToken(organizationId, connectorId) {
      return serviceFetch<{ success: boolean }>(
        config,
        `${base}/invalidate-connector-token`,
        { connectorId },
        organizationId,
      )
    },
  }
}
