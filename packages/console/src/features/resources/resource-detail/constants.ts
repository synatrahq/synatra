import {
  ENCRYPTED_PLACEHOLDER,
  type ResourceType,
  type APIResourceConfig,
  type InputResourceConfig,
  type InputRestApiAuth,
  type APIPostgresConfig,
  type APIMysqlConfig,
  type APIStripeConfig,
  type APIGitHubConfig,
  type APIIntercomConfig,
  type APIRestApiConfig,
  type APISynatraAiConfig,
  type LlmProvider,
  type ConnectionMode,
} from "@synatra/core/types"

export type EditableConfig = {
  apiConfig: APIResourceConfig
  sensitiveFields: {
    password?: string
    apiKey?: string
    caCertificate?: string | null
    clientCertificate?: string | null
    clientKey?: string | null
  }
}

export type DatabaseEditorConfig = {
  host: string
  port: number
  database: string
  user: string
  password: string
  caCertificate: string | null
  caCertificateFilename: string | null
  clientCertificate: string | null
  clientCertificateFilename: string | null
  clientKey: string | null
  clientKeyFilename: string | null
  ssl: boolean
  sslVerification: "full" | "verify_ca" | "skip_ca"
}

export type StripeEditorConfig = {
  apiKey: string
  apiVersion: string
}

export type GitHubEditorConfig = {
  appAccountId: string
}

export type IntercomEditorConfig = {
  appAccountId: string
}

export type RestApiEditorConfig = {
  baseUrl: string
  authType: "none" | "api_key" | "bearer" | "basic"
  apiKeyValue: string
  apiKeyLocation?: "header" | "query"
  apiKeyName?: string
  bearerToken: string
  basicUsername: string
  basicPassword: string
  originalAuthType: "none" | "api_key" | "bearer" | "basic"
  originalAuthConfig: string
  originalAuthUsername: string
  headers: Array<{ key: string; value: string }>
  queryParams: Array<{ key: string; value: string }>
}

export type SynatraAiProviderEditorConfig = {
  apiKey: string
  baseUrl: string | null
  enabled: boolean
}

export type SynatraAiEditorConfig = {
  openai: SynatraAiProviderEditorConfig
  anthropic: SynatraAiProviderEditorConfig
  google: SynatraAiProviderEditorConfig
}

export type EditableConfigState = {
  database?: DatabaseEditorConfig
  stripe?: StripeEditorConfig
  github?: GitHubEditorConfig
  intercom?: IntercomEditorConfig
  restapi?: RestApiEditorConfig
  synatraAi?: SynatraAiEditorConfig
  connectionMode: ConnectionMode
  connectorId: string | null
}

export function createEditorState(
  type: ResourceType,
  apiConfig: APIResourceConfig,
  connectionMode: ConnectionMode = "direct",
  connectorId: string | null = null,
): EditableConfigState {
  if (type === "postgres" || type === "mysql") {
    const dbConfig = apiConfig as APIPostgresConfig | APIMysqlConfig
    return {
      database: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        password: dbConfig.password,
        caCertificate: dbConfig.caCertificate,
        caCertificateFilename: dbConfig.caCertificateFilename,
        clientCertificate: dbConfig.clientCertificate,
        clientCertificateFilename: dbConfig.clientCertificateFilename,
        clientKey: dbConfig.clientKey,
        clientKeyFilename: dbConfig.clientKeyFilename,
        ssl: dbConfig.ssl,
        sslVerification: dbConfig.sslVerification,
      },
      connectionMode,
      connectorId,
    }
  }

  if (type === "stripe") {
    const stripeConfig = apiConfig as APIStripeConfig
    return {
      stripe: {
        apiKey: stripeConfig.apiKey,
        apiVersion: stripeConfig.apiVersion,
      },
      connectionMode,
      connectorId,
    }
  }

  if (type === "github" || type === "intercom") {
    const config = apiConfig as APIGitHubConfig | APIIntercomConfig
    return {
      [type]: { appAccountId: config.appAccountId },
      connectionMode,
      connectorId,
    } as EditableConfigState
  }

  if (type === "restapi") {
    const restConfig = apiConfig as APIRestApiConfig
    return {
      restapi: {
        baseUrl: restConfig.baseUrl,
        authType: restConfig.authType,
        originalAuthType: restConfig.authType,
        originalAuthConfig: restConfig.authConfig,
        originalAuthUsername: restConfig.authUsername ?? "",
        apiKeyValue: restConfig.authType === "api_key" ? restConfig.authConfig : "",
        apiKeyLocation: restConfig.authLocation,
        apiKeyName: restConfig.authName,
        bearerToken: restConfig.authType === "bearer" ? restConfig.authConfig : "",
        basicUsername: restConfig.authUsername ?? "",
        basicPassword: restConfig.authType === "basic" ? restConfig.authConfig : "",
        headers: restConfig.headers,
        queryParams: restConfig.queryParams,
      },
      connectionMode,
      connectorId,
    }
  }

  if (type === "synatra_ai") {
    const synatraConfig = apiConfig as APISynatraAiConfig
    const createProvider = (provider: APISynatraAiConfig["openai"]): SynatraAiProviderEditorConfig => ({
      apiKey: provider?.apiKey ?? "",
      baseUrl: provider?.baseUrl ?? null,
      enabled: provider?.enabled ?? true,
    })
    return {
      synatraAi: {
        openai: createProvider(synatraConfig.openai),
        anthropic: createProvider(synatraConfig.anthropic),
        google: createProvider(synatraConfig.google),
      },
      connectionMode,
      connectorId,
    }
  }

  throw new Error(`Unsupported resource type: ${type}`)
}

export function hasEditorChanges(
  type: ResourceType,
  editState: EditableConfigState,
  apiConfig: APIResourceConfig,
  originalConnectionMode: ConnectionMode,
  originalConnectorId: string | null,
): boolean {
  if (editState.connectionMode !== originalConnectionMode) return true
  if (editState.connectorId !== originalConnectorId) return true

  if (type === "postgres" || type === "mysql") {
    const db = editState.database
    const original = apiConfig as APIPostgresConfig | APIMysqlConfig
    if (!db) return false

    if (db.host !== original.host) return true
    if (db.port !== original.port) return true
    if (db.database !== original.database) return true
    if (db.user !== original.user) return true
    if (db.ssl !== original.ssl) return true
    if (db.sslVerification !== original.sslVerification) return true
    if (db.password !== original.password) return true
    if (db.caCertificate !== original.caCertificate) return true
    if (db.clientCertificate !== original.clientCertificate) return true
    if (db.clientKey !== original.clientKey) return true

    return false
  }

  if (type === "stripe") {
    const stripe = editState.stripe
    const original = apiConfig as APIStripeConfig
    if (!stripe) return false

    if (stripe.apiVersion !== original.apiVersion) return true
    if (stripe.apiKey !== original.apiKey) return true

    return false
  }

  if (type === "github") {
    const github = editState.github
    const original = apiConfig as APIGitHubConfig
    if (!github) return false

    if (github.appAccountId !== original.appAccountId) return true

    return false
  }

  if (type === "intercom") {
    const intercom = editState.intercom
    const original = apiConfig as APIIntercomConfig
    if (!intercom) return false

    if (intercom.appAccountId !== original.appAccountId) return true

    return false
  }

  if (type === "restapi") {
    const rest = editState.restapi
    const original = apiConfig as APIRestApiConfig
    if (!rest) return false

    if (rest.baseUrl !== original.baseUrl) return true
    if (rest.authType !== original.authType) return true

    if (rest.authType === "api_key") {
      if (rest.apiKeyValue !== rest.originalAuthConfig) return true
      if (rest.apiKeyLocation !== original.authLocation) return true
      if (rest.apiKeyName !== original.authName) return true
    }
    if (rest.authType === "bearer") {
      if (rest.bearerToken !== rest.originalAuthConfig) return true
    }
    if (rest.authType === "basic") {
      if (rest.basicUsername !== rest.originalAuthUsername) return true
      if (rest.basicPassword !== rest.originalAuthConfig) return true
    }

    const headers = rest.headers.filter((h) => h.key)
    const params = rest.queryParams.filter((p) => p.key)
    const origHeaders = original.headers.filter((h) => h.key)
    const origParams = original.queryParams.filter((p) => p.key)
    if (headers.length !== origHeaders.length) return true
    if (params.length !== origParams.length) return true

    for (let i = 0; i < headers.length; i++) {
      if (headers[i].key !== origHeaders[i]?.key) return true
      if (headers[i].value !== origHeaders[i]?.value) return true
    }
    for (let i = 0; i < params.length; i++) {
      if (params[i].key !== origParams[i]?.key) return true
      if (params[i].value !== origParams[i]?.value) return true
    }

    return false
  }

  if (type === "synatra_ai") {
    const ai = editState.synatraAi
    const original = apiConfig as APISynatraAiConfig
    if (!ai) return false

    const providers: LlmProvider[] = ["openai", "anthropic", "google"]
    for (const provider of providers) {
      const edit = ai[provider]
      const orig = original[provider]

      if (edit.apiKey !== (orig?.apiKey ?? "")) return true
      if (edit.baseUrl !== (orig?.baseUrl ?? null)) return true
      if (edit.enabled !== (orig?.enabled ?? true)) return true
    }

    return false
  }

  return false
}

const toInputSensitive = (v: string): string | null | undefined => {
  if (v === ENCRYPTED_PLACEHOLDER) return undefined
  if (v === "") return null
  return v
}

const toInputSensitiveNullable = (v: string | null): string | null | undefined => {
  if (v === null) return undefined
  if (v === ENCRYPTED_PLACEHOLDER) return undefined
  if (v === "") return null
  return v
}

export function editorStateToInputConfig(type: ResourceType, editState: EditableConfigState): InputResourceConfig {
  if (type === "postgres" || type === "mysql") {
    const db = editState.database!
    const caCertificate = toInputSensitiveNullable(db.caCertificate)
    const clientCertificate = toInputSensitiveNullable(db.clientCertificate)
    const clientKey = toInputSensitiveNullable(db.clientKey)

    const resolveFilename = (content: string | null | undefined, filename: string | null) => {
      if (content) return filename
      if (content === null) return null
      return undefined
    }

    return {
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.user,
      password: toInputSensitive(db.password),
      ssl: db.ssl,
      sslVerification: db.sslVerification,
      caCertificate,
      caCertificateFilename: resolveFilename(caCertificate, db.caCertificateFilename),
      clientCertificate,
      clientCertificateFilename: resolveFilename(clientCertificate, db.clientCertificateFilename),
      clientKey,
      clientKeyFilename: resolveFilename(clientKey, db.clientKeyFilename),
    }
  }

  if (type === "stripe") {
    const stripe = editState.stripe!
    return {
      apiKey: toInputSensitive(stripe.apiKey),
      apiVersion: stripe.apiVersion,
    }
  }

  if (type === "github") {
    const github = editState.github!
    return {
      appAccountId: github.appAccountId,
    }
  }

  if (type === "intercom") {
    const intercom = editState.intercom!
    return {
      appAccountId: intercom.appAccountId,
    }
  }

  if (type === "restapi") {
    const rest = editState.restapi!
    const headers = rest.headers.filter((h) => h.key)
    const queryParams = rest.queryParams.filter((p) => p.key)

    let auth: InputRestApiAuth | undefined
    if (rest.authType === "none") {
      auth = { type: "none" }
    } else if (rest.authType === "api_key") {
      auth = {
        type: "api_key",
        key: toInputSensitive(rest.apiKeyValue),
        location: rest.apiKeyLocation ?? "header",
        name: rest.apiKeyName ?? "X-API-Key",
      }
    } else if (rest.authType === "bearer") {
      auth = { type: "bearer", token: toInputSensitive(rest.bearerToken) }
    } else if (rest.authType === "basic") {
      auth = {
        type: "basic",
        username: rest.basicUsername !== rest.originalAuthUsername ? rest.basicUsername : undefined,
        password: toInputSensitive(rest.basicPassword),
      }
    }

    return {
      baseUrl: rest.baseUrl,
      auth,
      headers,
      queryParams,
    }
  }

  if (type === "synatra_ai") {
    const ai = editState.synatraAi!
    const result: Record<string, { apiKey?: string | null; baseUrl?: string | null; enabled?: boolean } | undefined> =
      {}

    const providers: LlmProvider[] = ["openai", "anthropic", "google"]
    for (const provider of providers) {
      const edit = ai[provider]
      result[provider] = {
        apiKey: toInputSensitive(edit.apiKey),
        baseUrl: edit.baseUrl,
        enabled: edit.enabled,
      }
    }

    return result as InputResourceConfig
  }

  throw new Error(`Unsupported resource type: ${type}`)
}

export function toInputConfig(type: ResourceType, editable: EditableConfig): InputResourceConfig {
  const { apiConfig, sensitiveFields } = editable

  if (type === "postgres" || type === "mysql") {
    const dbConfig = apiConfig as {
      host: string
      port: number
      database: string
      user: string
      ssl: boolean
      sslVerification: "full" | "verify_ca" | "skip_ca"
    }
    return {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: sensitiveFields.password,
      ssl: dbConfig.ssl,
      sslVerification: dbConfig.sslVerification,
      caCertificate: sensitiveFields.caCertificate,
      clientCertificate: sensitiveFields.clientCertificate,
      clientKey: sensitiveFields.clientKey,
    }
  }

  const stripeConfig = apiConfig as { apiVersion: string }
  return {
    apiKey: sensitiveFields.apiKey,
    apiVersion: stripeConfig.apiVersion,
  }
}

export type Tab = "configuration" | "logs"

export type Selection = { type: "environment"; environmentId: string }

export type SaveStatus = "idle" | "saving" | "saved" | "error"

export function getSelectionKey(selection: Selection): string {
  return `env-${selection.environmentId}`
}
