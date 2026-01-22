export type ConnectorMessageType = "register" | "heartbeat" | "result" | "error"
export type CloudCommandType = "query" | "introspect" | "test" | "ping" | "restapi" | "shutdown_notice"

export interface ConnectorMessage {
  type: ConnectorMessageType
  correlationId?: string
  payload?: unknown
}

export interface RegisterPayload {
  version: string
  platform: string
  capabilities: string[]
}

export interface ResultPayload {
  data: unknown
  rowCount?: number
}

export interface ErrorPayload {
  code: string
  message: string
}

export interface ShutdownNoticePayload {
  gracePeriodMs: number
}

export interface CloudCommand {
  type: CloudCommandType
  correlationId: string
  payload: QueryPayload | IntrospectPayload | TestPayload | RestApiPayload | ShutdownNoticePayload
}

export interface QueryPayload {
  resourceType: "postgres" | "mysql"
  config: {
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
  sql: string
  params?: unknown[]
}

export interface IntrospectPayload {
  resourceType: "postgres" | "mysql"
  config: {
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
  operation: "tables" | "columns"
  table?: string
  schema?: string
}

export interface TestPayload {
  resourceType: "postgres" | "mysql" | "stripe" | "restapi"
  config: Record<string, unknown>
}

export interface RestApiPayload {
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
