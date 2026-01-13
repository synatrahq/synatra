import pg from "pg"
import mysql from "mysql2/promise"
import { getResourceExecutionConfig, getAppAccountGitHubTokenInfo, getAppAccountCredentials } from "@synatra/core"
import { validateExternalUrl } from "@synatra/util/url"
import type { ResourceType } from "./types"
import type {
  PostgresConfig,
  MysqlConfig,
  StripeConfig,
  GitHubConfig,
  IntercomConfig,
  RestApiConfig,
} from "@synatra/core/types"
import { applyAuth } from "./restapi/auth"

const CONNECTION_TIMEOUT_MS = 5000
const QUERY_TIMEOUT_MS = 15000
const STRIPE_TIMEOUT_MS = 15000
const RESTAPI_TIMEOUT_MS = 10000

export const getResourceConfig = (resourceId: string, environmentId: string) =>
  getResourceExecutionConfig({ resourceId, environmentId })

export async function testConnection(
  type: ResourceType,
  configInput: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; latency?: number }> {
  const start = Date.now()

  try {
    if (type === "postgres") {
      const pgConfig = configInput as PostgresConfig
      const client = new pg.Client({
        host: pgConfig.host,
        port: pgConfig.port,
        database: pgConfig.database,
        user: pgConfig.user,
        password: pgConfig.password,
        ssl: sslForPostgres(pgConfig),
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        statement_timeout: QUERY_TIMEOUT_MS,
      })

      await client.connect()
      await client.query("SELECT 1")
      await client.end()

      return { success: true, latency: Date.now() - start }
    }

    if (type === "mysql") {
      const mysqlConfig = configInput as MysqlConfig
      const connection = await mysql.createConnection({
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        database: mysqlConfig.database,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        ssl: sslForMysql(mysqlConfig),
        connectTimeout: CONNECTION_TIMEOUT_MS,
      })

      await connection.query({ sql: "SELECT 1", timeout: QUERY_TIMEOUT_MS })
      await connection.end()

      return { success: true, latency: Date.now() - start }
    }

    if (type === "stripe") {
      const stripeConfig = configInput as StripeConfig
      const stripe = await import("stripe")
      const client = new stripe.default(stripeConfig.apiKey, {
        apiVersion: stripeConfig.apiVersion as any,
        timeout: STRIPE_TIMEOUT_MS,
      })
      await client.balance.retrieve()

      return { success: true, latency: Date.now() - start }
    }

    if (type === "github") {
      const ghConfig = configInput as GitHubConfig
      const tokenInfo = await getAppAccountGitHubTokenInfo(ghConfig.appAccountId)
      if (!tokenInfo) return { success: false, error: "App account not found" }

      const { githubRequest } = await import("./github/auth")
      await githubRequest(
        ghConfig.appAccountId,
        tokenInfo.installationId,
        tokenInfo.cachedToken,
        tokenInfo.tokenExpiresAt,
        "GET",
        "/installation/repositories",
      )

      return { success: true, latency: Date.now() - start }
    }

    if (type === "intercom") {
      const intercomConfig = configInput as IntercomConfig
      const credentials = await getAppAccountCredentials(intercomConfig.appAccountId)
      if (!credentials || credentials.type !== "oauth") {
        return { success: false, error: "App account not found or invalid credentials" }
      }

      const { intercomRequest } = await import("./intercom/auth")
      await intercomRequest(credentials.accessToken, "GET", "/me")

      return { success: true, latency: Date.now() - start }
    }

    if (type === "restapi") {
      const restapiConfig = configInput as RestApiConfig
      const authResult = applyAuth(restapiConfig.auth ?? { type: "none" })

      const url = new URL(restapiConfig.baseUrl)
      await validateExternalUrl(url.toString())

      for (const [key, value] of Object.entries({ ...(restapiConfig.queryParams ?? {}), ...authResult.queryParams })) {
        url.searchParams.set(key, value)
      }

      const headers: Record<string, string> = { ...(restapiConfig.headers ?? {}), ...authResult.headers }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), RESTAPI_TIMEOUT_MS)

      const response = await fetch(url.toString(), {
        method: "HEAD",
        headers,
        signal: controller.signal,
        redirect: "error",
      }).finally(() => clearTimeout(timeoutId))

      if (!response.ok && response.status !== 405) {
        return { success: false, error: `HTTP ${response.status}`, latency: Date.now() - start }
      }

      return { success: true, latency: Date.now() - start }
    }

    return { success: false, error: `Unsupported type: ${type}` }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latency: Date.now() - start,
    }
  }
}

function sslForPostgres(configInput: PostgresConfig) {
  if (!configInput.ssl) return false
  return {
    rejectUnauthorized: configInput.sslVerification !== "skip_ca",
    checkServerIdentity: configInput.sslVerification === "verify_ca" ? () => undefined : undefined,
    ca: configInput.caCertificate ?? undefined,
    cert: configInput.clientCertificate ?? undefined,
    key: configInput.clientKey ?? undefined,
  }
}

function sslForMysql(configInput: MysqlConfig) {
  if (!configInput.ssl) return undefined
  return {
    rejectUnauthorized: configInput.sslVerification !== "skip_ca",
    checkServerIdentity: configInput.sslVerification === "verify_ca" ? () => undefined : undefined,
    ca: configInput.caCertificate ?? undefined,
    cert: configInput.clientCertificate ?? undefined,
    key: configInput.clientKey ?? undefined,
  }
}
