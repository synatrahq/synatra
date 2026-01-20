import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { serviceAuth } from "@synatra/service-call"
import { UserConfigurableResourceType } from "@synatra/core/types"
import * as pool from "./pool"
import * as audit from "./audit"
import * as coordinator from "./coordinator"
import { config } from "./config"
import { getResourceConfig, testConnection } from "./resource"
import type {
  ExecutionConfig,
  DatabaseResource,
  StripeResource,
  GitHubResource,
  IntercomResource,
  PostgresResource,
  MysqlResource,
  RestApiResource,
} from "./types"
import type { QueryPayload, IntrospectPayload, ResultPayload, TestPayload } from "./ws-types"
import { principal } from "@synatra/core"
import {
  postgresOperation,
  executePostgresOperation,
  listTables as listPostgresTables,
  listColumns as listPostgresColumns,
  type TableInfo,
  type ColumnInfo,
} from "./postgres/operations"
import {
  mysqlOperation,
  executeMysqlOperation,
  listTables as listMysqlTables,
  listColumns as listMysqlColumns,
} from "./mysql/operations"
import { stripeOperation, executeStripeOperation } from "./stripe/operations"
import { githubOperation, executeGitHubOperation } from "./github/operations"
import { intercomOperation, executeIntercomOperation } from "./intercom/operations"
import { restapiOperation, executeRestApiOperation } from "./restapi/operations"
import { createError, fromUnknown, isAppError, isProblemDetails } from "@synatra/util/error"

function isDatabaseResource(config: ExecutionConfig): config is DatabaseResource {
  return config.type === "postgres" || config.type === "mysql"
}

function isPostgresResource(config: ExecutionConfig): config is PostgresResource {
  return config.type === "postgres"
}

function isMysqlResource(config: ExecutionConfig): config is MysqlResource {
  return config.type === "mysql"
}

function isStripeResource(config: ExecutionConfig): config is StripeResource {
  return config.type === "stripe"
}

function isGitHubResource(config: ExecutionConfig): config is GitHubResource {
  return config.type === "github"
}

function isIntercomResource(config: ExecutionConfig): config is IntercomResource {
  return config.type === "intercom"
}

function isRestApiResource(config: ExecutionConfig): config is RestApiResource {
  return config.type === "restapi"
}

const QUERY_TIMEOUT_MS = 15000
const RETRY_COUNT = 2

const app = new Hono()
const gatewayConfig = config()

app.use("*", serviceAuth(gatewayConfig.serviceSecret))

app.onError((err, c) => {
  if (isProblemDetails(err)) {
    return c.json({ success: false, error: err }, err.status as 400)
  }
  if (!isAppError(err)) {
    console.error("Unhandled error:", err)
  }
  const appError = fromUnknown(err)
  const problem = appError.toProblemDetails()
  return c.json({ success: false, error: problem }, problem.status as 400)
})

app.get("/health", (c) => {
  return c.json({ status: "ok" })
})

const operationSchema = z.union([
  postgresOperation,
  mysqlOperation,
  stripeOperation,
  githubOperation,
  intercomOperation,
  restapiOperation,
])

const querySchema = z.object({
  resourceId: z.string(),
  environmentId: z.string(),
  operation: operationSchema,
})

interface OperationResult {
  data: unknown
  rowCount?: number
}

app.post("/query", zValidator("json", querySchema), async (c) => {
  const { resourceId, environmentId, operation } = c.req.valid("json")
  const organizationId = c.get("organizationId")
  if (!organizationId) throw createError("BadRequestError", { message: "Missing organizationId in token" })

  return principal.withSystem({ organizationId }, async () => {
    const config = await getResourceConfig(resourceId, environmentId)
    if (!config) throw createError("NotFoundError", { type: "Resource", id: resourceId })
    if (config.type !== operation.type) {
      throw createError("BadRequestError", {
        message: `Resource type mismatch: expected ${config.type}, got ${operation.type}`,
      })
    }

    let result: OperationResult

    if (isGitHubResource(config) && operation.type === "github") {
      result = await withRetry(
        () => withTimeout(executeGitHubOperation(config, operation), QUERY_TIMEOUT_MS),
        RETRY_COUNT,
      )
    } else if (isStripeResource(config) && operation.type === "stripe") {
      result = await withRetry(
        () => withTimeout(executeStripeOperation(config, operation), QUERY_TIMEOUT_MS),
        RETRY_COUNT,
      )
    } else if (isIntercomResource(config) && operation.type === "intercom") {
      result = await withRetry(
        () => withTimeout(executeIntercomOperation(config, operation), QUERY_TIMEOUT_MS),
        RETRY_COUNT,
      )
    } else if (isRestApiResource(config) && operation.type === "restapi") {
      if (config.connectionMode === "connector" && config.connectorId) {
        if (!(await coordinator.isConnectorOnline(config.connectorId))) {
          throw createError("BadRequestError", { message: "Connector is offline" })
        }
        const payload = {
          resourceType: "restapi" as const,
          config: config.config,
          method: operation.method,
          path: operation.path,
          headers: operation.headers,
          queryParams: operation.queryParams,
          body: operation.body,
        }
        result = await coordinator.dispatchCommand<ResultPayload>(config.connectorId, { type: "restapi", payload })
      } else {
        result = await withRetry(
          () => withTimeout(executeRestApiOperation(config, operation), QUERY_TIMEOUT_MS),
          RETRY_COUNT,
        )
      }
    } else if (config.connectionMode === "connector" && config.connectorId) {
      if (!(await coordinator.isConnectorOnline(config.connectorId))) {
        throw createError("BadRequestError", { message: "Connector is offline" })
      }
      if (isDatabaseResource(config) && (operation.type === "postgres" || operation.type === "mysql")) {
        const payload: QueryPayload = {
          resourceType: operation.type,
          config: config.config,
          sql: operation.sql,
          params: operation.params,
        }
        result = await coordinator.dispatchCommand<ResultPayload>(config.connectorId, { type: "query", payload })
      } else {
        throw createError("BadRequestError", { message: "API resources cannot use connector mode" })
      }
    } else if (isPostgresResource(config) && operation.type === "postgres") {
      result = await withRetry(
        () => withTimeout(executePostgresOperation(resourceId, environmentId, config, operation), QUERY_TIMEOUT_MS),
        RETRY_COUNT,
      )
    } else if (isMysqlResource(config) && operation.type === "mysql") {
      result = await withRetry(
        () => withTimeout(executeMysqlOperation(resourceId, environmentId, config, operation), QUERY_TIMEOUT_MS),
        RETRY_COUNT,
      )
    } else {
      throw createError("BadRequestError", { message: `Unsupported operation type: ${operation.type}` })
    }

    await audit.write({
      resourceId,
      environmentId,
      operation: isDatabaseResource(config) ? "query" : "api",
      query: isDatabaseResource(config) ? sanitizeQuery((operation as { sql: string }).sql) : undefined,
      method:
        isStripeResource(config) || isGitHubResource(config) || isIntercomResource(config) || isRestApiResource(config)
          ? (operation as { method: string }).method
          : undefined,
      path:
        isStripeResource(config) || isRestApiResource(config)
          ? (operation as { path: string }).path
          : isGitHubResource(config) || isIntercomResource(config)
            ? (operation as { endpoint: string }).endpoint
            : undefined,
      rowCount: result.rowCount,
      timestamp: new Date(),
    })

    return c.json({ success: true, data: result.data, rowCount: result.rowCount })
  })
})

const testSchema = z.object({
  type: z.enum(UserConfigurableResourceType),
  config: z.record(z.string(), z.unknown()),
  connectionMode: z.enum(["direct", "connector"]).optional(),
  connectorId: z.string().nullable().optional(),
})

app.post("/test", zValidator("json", testSchema), async (c) => {
  const { type, config, connectionMode, connectorId } = c.req.valid("json")
  const organizationId = c.get("organizationId")
  if (!organizationId) throw createError("BadRequestError", { message: "Missing organizationId in token" })

  return principal.withSystem({ organizationId }, async () => {
    if (connectionMode === "connector" && connectorId) {
      if (type === "stripe" || type === "github" || type === "intercom") {
        throw createError("BadRequestError", { message: `${type} resources cannot use connector mode` })
      }
      if (!(await coordinator.isConnectorOnline(connectorId))) {
        return c.json({ success: false, error: "Connector is offline" })
      }
      const payload: TestPayload = { resourceType: type, config }
      const result = await coordinator.dispatchCommand<{ success: boolean; error?: string; latency?: number }>(
        connectorId,
        { type: "test", payload },
      )
      return c.json(result)
    }

    const result = await testConnection(type, config)
    return c.json(result)
  })
})

const invalidateSchema = z.object({
  resourceId: z.string(),
  environmentId: z.string(),
})

app.post("/invalidate", zValidator("json", invalidateSchema), async (c) => {
  const { resourceId, environmentId } = c.req.valid("json")
  await pool.invalidate(resourceId, environmentId)
  return c.json({ success: true })
})

const invalidateConnectorTokenSchema = z.object({
  connectorId: z.string(),
})

app.post("/invalidate-connector-token", zValidator("json", invalidateConnectorTokenSchema), async (c) => {
  const { connectorId } = c.req.valid("json")
  const organizationId = c.get("organizationId")
  if (!organizationId) throw createError("BadRequestError", { message: "Missing organizationId in token" })

  return principal.withSystem({ organizationId }, async () => {
    await coordinator.incrementTokenVersion(connectorId)
    return c.json({ success: true })
  })
})

const tablesSchema = z.object({
  resourceId: z.string(),
  environmentId: z.string(),
})

app.post("/tables", zValidator("json", tablesSchema), async (c) => {
  const { resourceId, environmentId } = c.req.valid("json")
  const organizationId = c.get("organizationId")
  if (!organizationId) throw createError("BadRequestError", { message: "Missing organizationId in token" })

  return principal.withSystem({ organizationId }, async () => {
    const config = await getResourceConfig(resourceId, environmentId)
    if (!config) throw createError("NotFoundError", { type: "Resource", id: resourceId })
    if (!isDatabaseResource(config)) {
      throw createError("BadRequestError", { message: "Resource is not a database" })
    }

    let tables: TableInfo[]

    if (config.connectionMode === "connector" && config.connectorId) {
      if (!(await coordinator.isConnectorOnline(config.connectorId))) {
        throw createError("BadRequestError", { message: "Connector is offline" })
      }
      const payload: IntrospectPayload = {
        resourceType: config.type,
        config: config.config,
        operation: "tables",
      }
      const result = await coordinator.dispatchCommand<ResultPayload>(config.connectorId, {
        type: "introspect",
        payload,
      })
      tables = result.data as TableInfo[]
    } else if (isPostgresResource(config)) {
      tables = await listPostgresTables(resourceId, environmentId, config)
    } else if (isMysqlResource(config)) {
      tables = await listMysqlTables(resourceId, environmentId, config)
    } else {
      throw createError("BadRequestError", { message: "Unsupported database type" })
    }

    return c.json({ success: true, data: tables })
  })
})

const columnsSchema = z.object({
  resourceId: z.string(),
  environmentId: z.string(),
  table: z.string(),
  schema: z.string().optional(),
})

app.post("/columns", zValidator("json", columnsSchema), async (c) => {
  const { resourceId, environmentId, table, schema } = c.req.valid("json")
  const organizationId = c.get("organizationId")
  if (!organizationId) throw createError("BadRequestError", { message: "Missing organizationId in token" })

  return principal.withSystem({ organizationId }, async () => {
    const config = await getResourceConfig(resourceId, environmentId)
    if (!config) throw createError("NotFoundError", { type: "Resource", id: resourceId })
    if (!isDatabaseResource(config)) {
      throw createError("BadRequestError", { message: "Resource is not a database" })
    }

    let columns: ColumnInfo[]

    if (config.connectionMode === "connector" && config.connectorId) {
      if (!(await coordinator.isConnectorOnline(config.connectorId))) {
        throw createError("BadRequestError", { message: "Connector is offline" })
      }
      const payload: IntrospectPayload = {
        resourceType: config.type,
        config: config.config,
        operation: "columns",
        table,
        schema,
      }
      const result = await coordinator.dispatchCommand<ResultPayload>(config.connectorId, {
        type: "introspect",
        payload,
      })
      columns = result.data as ColumnInfo[]
    } else if (isPostgresResource(config)) {
      columns = await listPostgresColumns(resourceId, environmentId, config, table, schema)
    } else if (isMysqlResource(config)) {
      columns = await listMysqlColumns(resourceId, environmentId, config, table)
    } else {
      throw createError("BadRequestError", { message: "Unsupported database type" })
    }

    return c.json({ success: true, data: columns })
  })
})

function sanitizeQuery(query: string): string {
  return query.replace(/(['"])(?:(?!\1).)*\1/g, "'***'").substring(0, 1000)
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(createError("TimeoutError", { message: "Upstream timeout" })), timeoutMs)
  })
  const result = await Promise.race([promise, timeoutPromise])
  if (timer) clearTimeout(timer)
  return result
}

export { app }
