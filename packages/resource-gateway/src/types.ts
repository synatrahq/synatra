import type {
  ResourceType,
  ConnectionMode,
  PostgresConfig,
  MysqlConfig,
  StripeConfig,
  RestApiConfig,
  ResolvedGitHubConfig,
  ResolvedIntercomConfig,
  ExecutionConfig,
} from "@synatra/core/types"

export type { ResourceType, ConnectionMode, ResolvedGitHubConfig, ResolvedIntercomConfig, ExecutionConfig }

export type PostgresResource = Extract<ExecutionConfig, { type: "postgres" }>
export type MysqlResource = Extract<ExecutionConfig, { type: "mysql" }>
export type StripeResource = Extract<ExecutionConfig, { type: "stripe" }>
export type GitHubResource = Extract<ExecutionConfig, { type: "github" }>
export type IntercomResource = Extract<ExecutionConfig, { type: "intercom" }>
export type RestApiResource = Extract<ExecutionConfig, { type: "restapi" }>

export type DatabaseResource = PostgresResource | MysqlResource

export type { PostgresConfig, MysqlConfig, StripeConfig, RestApiConfig }

export interface PooledClient {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>
  release(): void
}

export interface AuditEntry {
  resourceId: string
  environmentId: string
  operation: "query" | "api"
  query?: string
  method?: string
  path?: string
  rowCount?: number
  timestamp: Date
}
