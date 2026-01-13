import { z } from "zod"

export const ManagedResourceType = ["synatra_ai"] as const
export type ManagedResourceType = (typeof ManagedResourceType)[number]

export const UserConfigurableResourceType = ["postgres", "mysql", "stripe", "github", "intercom", "restapi"] as const
export type UserConfigurableResourceType = (typeof UserConfigurableResourceType)[number]

export const ResourceType = [...UserConfigurableResourceType, ...ManagedResourceType] as const
export type ResourceType = (typeof ResourceType)[number]

export const DatabaseResourceType = ["postgres", "mysql"] as const
export type DatabaseResourceType = (typeof DatabaseResourceType)[number]

export const ConnectorSupportedResourceType = ["postgres", "mysql", "restapi"] as const
export type ConnectorSupportedResourceType = (typeof ConnectorSupportedResourceType)[number]

export const ConnectionTestableResourceType = ["postgres", "mysql", "stripe"] as const
export type ConnectionTestableResourceType = (typeof ConnectionTestableResourceType)[number]

export function isManagedResourceType(type: string): type is ManagedResourceType {
  return ManagedResourceType.includes(type as ManagedResourceType)
}

export function isConnectionTestable(type: string): type is ConnectionTestableResourceType {
  return ConnectionTestableResourceType.includes(type as ConnectionTestableResourceType)
}

export const LlmProvider = ["openai", "anthropic", "google"] as const
export type LlmProvider = (typeof LlmProvider)[number]

export const ConnectionMode = ["direct", "connector"] as const
export type ConnectionMode = (typeof ConnectionMode)[number]

export const SENSITIVE_FIELDS = {
  postgres: ["password", "caCertificate", "clientCertificate", "clientKey"] as const,
  mysql: ["password", "caCertificate", "clientCertificate", "clientKey"] as const,
  stripe: ["apiKey"] as const,
  github: [] as const,
  intercom: [] as const,
  restapi: ["authConfig"] as const,
  synatra_ai: ["providers"] as const,
} as const

// =============================================================================
// Decrypted Config (internal use, after decryption)
// =============================================================================

export type PostgresConfig = {
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

export type MysqlConfig = {
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

export type StripeConfig = {
  apiKey: string
  apiVersion: string
}

export type GitHubConfig = {
  appAccountId: string
}

export type IntercomConfig = {
  appAccountId: string
}

export type RestApiAuth =
  | { type: "none" }
  | { type: "api_key"; key: string; location: "header" | "query"; name: string }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }

export type RestApiConfig = {
  baseUrl: string
  auth: RestApiAuth
  headers: Record<string, string>
  queryParams: Record<string, string>
}

export type LlmProviderConfig = {
  apiKey: string
  baseUrl: string | null
  enabled: boolean
}

export type SynatraAiConfig = {
  openai: LlmProviderConfig | null
  anthropic: LlmProviderConfig | null
  google: LlmProviderConfig | null
}

export type ResourceConfigMap = {
  postgres: PostgresConfig
  mysql: MysqlConfig
  stripe: StripeConfig
  github: GitHubConfig
  intercom: IntercomConfig
  restapi: RestApiConfig
  synatra_ai: SynatraAiConfig
}

export type ResourceConfigValue =
  | PostgresConfig
  | MysqlConfig
  | StripeConfig
  | GitHubConfig
  | IntercomConfig
  | RestApiConfig
  | SynatraAiConfig

// =============================================================================
// Stored Config (DB storage, with encrypted sensitive fields) - Zod Schemas
// =============================================================================

const EncryptedValueSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
})

const SslVerificationSchema = z.enum(["full", "verify_ca", "skip_ca"])

export const StoredPostgresConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  user: z.string(),
  password: EncryptedValueSchema.nullable(),
  ssl: z.boolean(),
  sslVerification: SslVerificationSchema,
  caCertificate: EncryptedValueSchema.nullable(),
  caCertificateFilename: z.string().nullable(),
  clientCertificate: EncryptedValueSchema.nullable(),
  clientCertificateFilename: z.string().nullable(),
  clientKey: EncryptedValueSchema.nullable(),
  clientKeyFilename: z.string().nullable(),
})
export type StoredPostgresConfig = z.infer<typeof StoredPostgresConfigSchema>

export const StoredMysqlConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  user: z.string(),
  password: EncryptedValueSchema.nullable(),
  ssl: z.boolean(),
  sslVerification: SslVerificationSchema,
  caCertificate: EncryptedValueSchema.nullable(),
  caCertificateFilename: z.string().nullable(),
  clientCertificate: EncryptedValueSchema.nullable(),
  clientCertificateFilename: z.string().nullable(),
  clientKey: EncryptedValueSchema.nullable(),
  clientKeyFilename: z.string().nullable(),
})
export type StoredMysqlConfig = z.infer<typeof StoredMysqlConfigSchema>

export const StoredStripeConfigSchema = z.object({
  apiKey: EncryptedValueSchema.nullable(),
  apiVersion: z.string(),
})
export type StoredStripeConfig = z.infer<typeof StoredStripeConfigSchema>

export const StoredGitHubConfigSchema = z.object({
  appAccountId: z.string(),
})
export type StoredGitHubConfig = z.infer<typeof StoredGitHubConfigSchema>

export const StoredIntercomConfigSchema = z.object({
  appAccountId: z.string(),
})
export type StoredIntercomConfig = z.infer<typeof StoredIntercomConfigSchema>

export const StoredRestApiConfigSchema = z.object({
  baseUrl: z.string(),
  authType: z.enum(["none", "api_key", "bearer", "basic"]),
  authConfig: EncryptedValueSchema.nullable(),
  authLocation: z.enum(["header", "query"]).optional(),
  authName: z.string().optional(),
  headers: z.record(z.string(), z.string()),
  queryParams: z.record(z.string(), z.string()),
})
export type StoredRestApiConfig = z.infer<typeof StoredRestApiConfigSchema>

const StoredLlmProviderConfigSchema = z
  .object({
    apiKey: EncryptedValueSchema,
    baseUrl: z.string().nullable(),
    enabled: z.boolean(),
  })
  .nullable()

export const StoredSynatraAiConfigSchema = z.object({
  openai: StoredLlmProviderConfigSchema,
  anthropic: StoredLlmProviderConfigSchema,
  google: StoredLlmProviderConfigSchema,
})
export type StoredSynatraAiConfig = z.infer<typeof StoredSynatraAiConfigSchema>

export const StoredResourceConfigSchema = z.union([
  StoredPostgresConfigSchema,
  StoredMysqlConfigSchema,
  StoredStripeConfigSchema,
  StoredGitHubConfigSchema,
  StoredIntercomConfigSchema,
  StoredRestApiConfigSchema,
  StoredSynatraAiConfigSchema,
])
export type StoredResourceConfig = z.infer<typeof StoredResourceConfigSchema>

// =============================================================================
// API Response Config (masked sensitive fields)
// =============================================================================

export type APIPostgresConfig = {
  host: string
  port: number
  database: string
  user: string
  hasPassword: boolean
  ssl: boolean
  sslVerification: "full" | "verify_ca" | "skip_ca"
  hasCaCertificate: boolean
  caCertificateFilename: string | null
  hasClientCertificate: boolean
  clientCertificateFilename: string | null
  hasClientKey: boolean
  clientKeyFilename: string | null
}

export type APIMysqlConfig = {
  host: string
  port: number
  database: string
  user: string
  hasPassword: boolean
  ssl: boolean
  sslVerification: "full" | "verify_ca" | "skip_ca"
  hasCaCertificate: boolean
  caCertificateFilename: string | null
  hasClientCertificate: boolean
  clientCertificateFilename: string | null
  hasClientKey: boolean
  clientKeyFilename: string | null
}

export type APIStripeConfig = {
  hasApiKey: boolean
  apiVersion: string
}

export type APIGitHubConfig = {
  appAccountId: string
}

export type APIIntercomConfig = {
  appAccountId: string
}

export type APIRestApiConfig = {
  baseUrl: string
  authType: "none" | "api_key" | "bearer" | "basic"
  hasAuthConfig: boolean
  authLocation?: "header" | "query"
  authName?: string
  headers: Record<string, string>
  queryParams: Record<string, string>
}

export type APILlmProviderConfig = {
  hasApiKey: boolean
  baseUrl: string | null
  enabled: boolean
}

export type APISynatraAiConfig = {
  openai: APILlmProviderConfig | null
  anthropic: APILlmProviderConfig | null
  google: APILlmProviderConfig | null
}

export type APIResourceConfig =
  | APIPostgresConfig
  | APIMysqlConfig
  | APIStripeConfig
  | APIGitHubConfig
  | APIIntercomConfig
  | APIRestApiConfig
  | APISynatraAiConfig

// =============================================================================
// API Input Config (optional sensitive fields for upsert)
// =============================================================================

export type InputPostgresConfig = {
  host: string
  port: number
  database: string
  user: string
  password?: string | null
  ssl: boolean
  sslVerification: "full" | "verify_ca" | "skip_ca"
  caCertificate?: string | null
  caCertificateFilename?: string | null
  clientCertificate?: string | null
  clientCertificateFilename?: string | null
  clientKey?: string | null
  clientKeyFilename?: string | null
}

export type InputMysqlConfig = {
  host: string
  port: number
  database: string
  user: string
  password?: string | null
  ssl: boolean
  sslVerification: "full" | "verify_ca" | "skip_ca"
  caCertificate?: string | null
  caCertificateFilename?: string | null
  clientCertificate?: string | null
  clientCertificateFilename?: string | null
  clientKey?: string | null
  clientKeyFilename?: string | null
}

export type InputStripeConfig = {
  apiKey?: string | null
  apiVersion: string
}

export type InputGitHubConfig = {
  appAccountId: string
}

export type InputIntercomConfig = {
  appAccountId: string
}

export type InputRestApiAuth =
  | { type: "none" }
  | { type: "api_key"; key?: string; location: "header" | "query"; name: string }
  | { type: "bearer"; token?: string }
  | { type: "basic"; username?: string; password?: string }

export type InputRestApiConfig = {
  baseUrl: string
  auth?: InputRestApiAuth | null
  headers?: Record<string, string>
  queryParams?: Record<string, string>
}

export type InputLlmProviderConfig = {
  apiKey?: string | null
  baseUrl?: string | null
  enabled?: boolean
}

export type InputSynatraAiConfig = {
  openai?: InputLlmProviderConfig | null
  anthropic?: InputLlmProviderConfig | null
  google?: InputLlmProviderConfig | null
}

export type InputResourceConfig =
  | InputPostgresConfig
  | InputMysqlConfig
  | InputStripeConfig
  | InputGitHubConfig
  | InputIntercomConfig
  | InputRestApiConfig
  | InputSynatraAiConfig

// =============================================================================
// Execution Config (for resource-gateway, with resolved GitHub credentials)
// =============================================================================

export type ResolvedGitHubConfig = {
  appAccountId: string
  installationId: string
  cachedToken: string | null
  tokenExpiresAt: string | null
}

export type ResolvedIntercomConfig = {
  appAccountId: string
  accessToken: string
}

export type ExecutionConfig =
  | { type: "postgres"; config: PostgresConfig; connectionMode: ConnectionMode; connectorId: string | null }
  | { type: "mysql"; config: MysqlConfig; connectionMode: ConnectionMode; connectorId: string | null }
  | { type: "stripe"; config: StripeConfig; connectionMode: ConnectionMode; connectorId: string | null }
  | { type: "github"; config: ResolvedGitHubConfig; connectionMode: ConnectionMode; connectorId: string | null }
  | { type: "intercom"; config: ResolvedIntercomConfig; connectionMode: ConnectionMode; connectorId: string | null }
  | { type: "restapi"; config: RestApiConfig; connectionMode: ConnectionMode; connectorId: string | null }
