import type {
  ResourceType,
  APIResourceConfig,
  InputResourceConfig,
  InputRestApiAuth,
  APIPostgresConfig,
  APIMysqlConfig,
  APIStripeConfig,
  APIGitHubConfig,
  APIIntercomConfig,
  APIRestApiConfig,
  APISynatraAiConfig,
  LlmProvider,
  ConnectionMode,
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

// Editor config types for UI state management
export type DatabaseEditorConfig = {
  host: string
  port: number
  database: string
  user: string
  password?: string // undefined = unchanged, "" = cleared by user, string = new value
  hasPassword: boolean // from API
  caCertificate?: string | null
  caCertificateFilename?: string | null
  hasCaCertificate: boolean
  clientCertificate?: string | null
  clientCertificateFilename?: string | null
  hasClientCertificate: boolean
  clientKey?: string | null
  clientKeyFilename?: string | null
  hasClientKey: boolean
  ssl: boolean
  sslVerification: "full" | "verify_ca" | "skip_ca"
}

export type StripeEditorConfig = {
  apiKey?: string
  hasApiKey: boolean
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
  apiKeyValue?: string
  apiKeyLocation?: "header" | "query"
  apiKeyName?: string
  bearerToken?: string
  basicUsername?: string
  basicPassword?: string
  hasAuthConfig: boolean
  originalAuthType: "none" | "api_key" | "bearer" | "basic"
  headers: Array<{ key: string; value: string }>
  queryParams: Array<{ key: string; value: string }>
}

export type SynatraAiProviderEditorConfig = {
  apiKey?: string
  hasApiKey: boolean
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

// Create initial editor state from API config
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
        hasPassword: dbConfig.hasPassword,
        password: undefined,
        caCertificate: undefined,
        caCertificateFilename: dbConfig.caCertificateFilename ?? undefined,
        hasCaCertificate: dbConfig.hasCaCertificate,
        clientCertificate: undefined,
        clientCertificateFilename: dbConfig.clientCertificateFilename ?? undefined,
        hasClientCertificate: dbConfig.hasClientCertificate,
        clientKey: undefined,
        clientKeyFilename: dbConfig.clientKeyFilename ?? undefined,
        hasClientKey: dbConfig.hasClientKey,
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
        hasApiKey: stripeConfig.hasApiKey,
        apiKey: undefined,
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
        hasAuthConfig: restConfig.hasAuthConfig,
        originalAuthType: restConfig.authType,
        apiKeyValue: undefined,
        apiKeyLocation: restConfig.authLocation,
        apiKeyName: restConfig.authName,
        bearerToken: undefined,
        basicUsername: undefined,
        basicPassword: undefined,
        headers: Object.entries(restConfig.headers).map(([key, value]) => ({ key, value })),
        queryParams: Object.entries(restConfig.queryParams).map(([key, value]) => ({ key, value })),
      },
      connectionMode,
      connectorId,
    }
  }

  if (type === "synatra_ai") {
    const synatraConfig = apiConfig as APISynatraAiConfig
    const createProvider = (provider: APISynatraAiConfig["openai"]): SynatraAiProviderEditorConfig => ({
      apiKey: undefined,
      hasApiKey: provider?.hasApiKey ?? false,
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

// Check if editor state has actual changes compared to original API config
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

    if (db.password !== undefined && db.password !== "") return true
    if (db.caCertificate !== undefined) return true
    if (db.clientCertificate !== undefined) return true
    if (db.clientKey !== undefined) return true

    return false
  }

  if (type === "stripe") {
    const stripe = editState.stripe
    const original = apiConfig as APIStripeConfig
    if (!stripe) return false

    if (stripe.apiVersion !== original.apiVersion) return true
    if (stripe.apiKey !== undefined && stripe.apiKey !== "") return true

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

    if (rest.authType === "none" && original.authType !== "none") return true
    if (rest.authType === "api_key") {
      const hasKey = rest.apiKeyValue !== undefined && rest.apiKeyValue !== ""
      if (hasKey) return true
      if (original.authType === "api_key") {
        if (rest.apiKeyLocation !== original.authLocation) return true
        if (rest.apiKeyName !== original.authName) return true
      }
    }
    if (rest.authType === "bearer") {
      if (rest.bearerToken !== undefined && rest.bearerToken !== "") return true
    }
    if (rest.authType === "basic") {
      const hasUsername = rest.basicUsername !== undefined && rest.basicUsername !== ""
      const hasPassword = rest.basicPassword !== undefined && rest.basicPassword !== ""
      if (hasUsername && hasPassword) return true
    }

    const headers = rest.headers.filter((h) => h.key)
    const params = rest.queryParams.filter((p) => p.key)
    const origHeaders = Object.entries(original.headers)
    const origParams = Object.entries(original.queryParams)
    if (headers.length !== origHeaders.length) return true
    if (params.length !== origParams.length) return true

    for (let i = 0; i < headers.length; i++) {
      if (headers[i].key !== origHeaders[i]?.[0]) return true
      if (headers[i].value !== origHeaders[i]?.[1]) return true
    }
    for (let i = 0; i < params.length; i++) {
      if (params[i].key !== origParams[i]?.[0]) return true
      if (params[i].value !== origParams[i]?.[1]) return true
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

      if (edit.apiKey !== undefined && edit.apiKey !== "") return true
      if (edit.baseUrl !== (orig?.baseUrl ?? null)) return true
      if (edit.enabled !== (orig?.enabled ?? true)) return true
    }

    return false
  }

  return false
}

// Convert editor state to input config for saving
export function editorStateToInputConfig(type: ResourceType, editState: EditableConfigState): InputResourceConfig {
  if (type === "postgres" || type === "mysql") {
    const db = editState.database!
    const emptyToNull = (v: string | null | undefined) => (v === "" ? null : v)
    const caCertificate = emptyToNull(db.caCertificate)
    const clientCertificate = emptyToNull(db.clientCertificate)
    const clientKey = emptyToNull(db.clientKey)

    const resolveFilename = (content: string | null | undefined, filename: string | null | undefined) => {
      if (content) return filename
      if (content === null) return null
      return undefined
    }

    return {
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.user,
      password: db.password === "" ? undefined : db.password,
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
      apiKey: stripe.apiKey === "" ? undefined : stripe.apiKey,
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
    const headers = Object.fromEntries(rest.headers.filter((h) => h.key).map((h) => [h.key, h.value]))
    const queryParams = Object.fromEntries(rest.queryParams.filter((p) => p.key).map((p) => [p.key, p.value]))

    let auth: InputRestApiAuth | undefined
    if (rest.authType === "none") {
      auth = { type: "none" }
    } else if (rest.authType === "api_key") {
      const hasKey = rest.apiKeyValue !== undefined && rest.apiKeyValue !== ""
      auth = {
        type: "api_key",
        key: hasKey ? rest.apiKeyValue : undefined,
        location: rest.apiKeyLocation ?? "header",
        name: rest.apiKeyName ?? "X-API-Key",
      }
    } else if (rest.authType === "bearer") {
      const hasToken = rest.bearerToken !== undefined && rest.bearerToken !== ""
      auth = { type: "bearer", token: hasToken ? rest.bearerToken : undefined }
    } else if (rest.authType === "basic") {
      const hasUsername = rest.basicUsername !== undefined && rest.basicUsername !== ""
      const hasPassword = rest.basicPassword !== undefined && rest.basicPassword !== ""
      auth = {
        type: "basic",
        username: hasUsername ? rest.basicUsername : undefined,
        password: hasPassword ? rest.basicPassword : undefined,
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
    const result: Record<string, { apiKey?: string; baseUrl?: string | null; enabled?: boolean } | undefined> = {}

    const providers: LlmProvider[] = ["openai", "anthropic", "google"]
    for (const provider of providers) {
      const edit = ai[provider]
      const hasKey = edit.apiKey !== undefined && edit.apiKey !== ""
      result[provider] = {
        apiKey: hasKey ? edit.apiKey : undefined,
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
