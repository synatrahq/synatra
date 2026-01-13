import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, first } from "./database"
import { createError } from "@synatra/util/error"
import { generateSlug } from "@synatra/util/identifier"
import { ResourceTable, ResourceConfigTable } from "./schema/resource.sql"
import { EnvironmentTable } from "./schema/environment.sql"
import { ConnectorTable } from "./schema/connector.sql"
import { AppAccountTable } from "./schema/app-account.sql"
import { decrypt, encrypt, isEncryptedValue } from "@synatra/util/crypto"
import { SENSITIVE_FIELDS } from "./types"
import type {
  ResourceConfigValue,
  ResourceType,
  StoredResourceConfig,
  StoredRestApiConfig,
  StoredSynatraAiConfig,
  InputResourceConfig,
  InputRestApiConfig,
  InputSynatraAiConfig,
  ConnectionMode,
  PostgresConfig,
  MysqlConfig,
  StripeConfig,
  GitHubConfig,
  IntercomConfig,
  RestApiConfig,
  SynatraAiConfig,
  LlmProvider,
  ExecutionConfig,
} from "./types"
import type { GitHubAppCredentials, OAuthCredentials } from "./types"

export const EnsureManagedResourceSchema = z.enum(["synatra_ai"])

export const GetManagedResourceWithConfigsSchema = z.enum(["synatra_ai"])

export const GetResourceConfigSchema = z.object({ resourceId: z.string(), environmentId: z.string() })

export const CreateResourceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["postgres", "mysql", "stripe", "github", "intercom", "restapi", "synatra_ai"]),
  managed: z.boolean().optional(),
  configs: z
    .array(
      z.object({
        environmentId: z.string(),
        config: z.unknown(),
      }),
    )
    .optional(),
})

export const UpdateResourceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
})

export const UpsertResourceConfigSchema = z.object({
  resourceId: z.string(),
  environmentId: z.string(),
  config: z.unknown(),
  connectionMode: z.enum(["direct", "connector"]).optional(),
  connectorId: z.string().nullable().optional(),
})

export const RemoveResourceConfigSchema = z.object({
  resourceId: z.string(),
  environmentId: z.string(),
})

export const GetResourceProviderConfigSchema = z.object({
  environmentId: z.string(),
  provider: z.enum(["openai", "anthropic", "google"]),
})

export const GetResourceExecutionConfigSchema = z.object({ resourceId: z.string(), environmentId: z.string() })

function encryptSensitiveFields(
  type: ResourceType,
  config: InputResourceConfig,
  existingConfig?: StoredResourceConfig,
): StoredResourceConfig {
  const result: Record<string, unknown> = existingConfig ? { ...existingConfig } : {}
  const sensitiveFields: readonly string[] = SENSITIVE_FIELDS[type]

  if (type === "restapi") {
    const restapiInput = config as InputRestApiConfig
    const existingRestapi = existingConfig as StoredRestApiConfig | undefined
    result.baseUrl = restapiInput.baseUrl
    result.headers = restapiInput.headers ?? existingRestapi?.headers ?? {}
    result.queryParams = restapiInput.queryParams ?? existingRestapi?.queryParams ?? {}
    if (restapiInput.auth !== undefined) {
      if (restapiInput.auth === null || restapiInput.auth.type === "none") {
        result.authType = "none"
        result.authConfig = null
        result.authLocation = undefined
        result.authName = undefined
      } else if (restapiInput.auth.type === "api_key") {
        result.authType = "api_key"
        result.authLocation = restapiInput.auth.location
        result.authName = restapiInput.auth.name
        if (restapiInput.auth.key) {
          result.authConfig = encrypt(JSON.stringify({ type: "api_key", key: restapiInput.auth.key }))
        } else if (existingRestapi?.authType !== "api_key") {
          result.authConfig = null
        }
      } else if (restapiInput.auth.type === "bearer") {
        result.authType = "bearer"
        result.authLocation = undefined
        result.authName = undefined
        if (restapiInput.auth.token) {
          result.authConfig = encrypt(JSON.stringify({ type: "bearer", token: restapiInput.auth.token }))
        } else if (existingRestapi?.authType !== "bearer") {
          result.authConfig = null
        }
      } else if (restapiInput.auth.type === "basic") {
        result.authType = "basic"
        result.authLocation = undefined
        result.authName = undefined
        if (restapiInput.auth.username && restapiInput.auth.password) {
          result.authConfig = encrypt(
            JSON.stringify({
              type: "basic",
              username: restapiInput.auth.username,
              password: restapiInput.auth.password,
            }),
          )
        } else if (existingRestapi?.authType !== "basic") {
          result.authConfig = null
        }
      }
    }
    return result as StoredResourceConfig
  }

  if (type === "synatra_ai") {
    const input = config as InputSynatraAiConfig
    const existing = existingConfig as StoredSynatraAiConfig | undefined
    const providers: LlmProvider[] = ["openai", "anthropic", "google"]

    for (const provider of providers) {
      const providerInput = input[provider]
      const existingProvider = existing?.[provider]

      if (providerInput === null) {
        result[provider] = null
      } else if (providerInput === undefined) {
        result[provider] = existingProvider ?? null
      } else {
        const apiKey = providerInput.apiKey
        const baseUrl = providerInput.baseUrl ?? existingProvider?.baseUrl ?? null
        const enabled = providerInput.enabled ?? existingProvider?.enabled ?? true

        if (apiKey) {
          result[provider] = { apiKey: encrypt(apiKey), baseUrl, enabled }
        } else if (existingProvider?.apiKey) {
          result[provider] = { apiKey: existingProvider.apiKey, baseUrl, enabled }
        } else {
          result[provider] = null
        }
      }
    }

    return result as StoredResourceConfig
  }

  for (const key of sensitiveFields) {
    const value = (config as Record<string, unknown>)[key]
    if (value === undefined) continue
    if (value === null || value === "") {
      result[key] = null
      continue
    }
    result[key] = typeof value === "string" ? encrypt(value) : null
  }

  for (const [key, value] of Object.entries(config)) {
    if (sensitiveFields.includes(key)) continue
    if (key.endsWith("Filename")) {
      const contentField = key.replace("Filename", "")
      if ((config as Record<string, unknown>)[contentField] === undefined) continue
    }
    result[key] = value
  }

  return result as StoredResourceConfig
}

function decryptSensitiveFields(type: ResourceType, stored: StoredResourceConfig): ResourceConfigValue {
  if (type === "synatra_ai") {
    const synatraStored = stored as StoredSynatraAiConfig
    const providers: LlmProvider[] = ["openai", "anthropic", "google"]
    const result: SynatraAiConfig = { openai: null, anthropic: null, google: null }

    for (const provider of providers) {
      const providerConfig = synatraStored[provider]
      if (providerConfig?.apiKey && isEncryptedValue(providerConfig.apiKey)) {
        result[provider] = {
          apiKey: decrypt(providerConfig.apiKey),
          baseUrl: providerConfig.baseUrl,
          enabled: providerConfig.enabled ?? true,
        }
      }
    }

    return result
  }

  if (type !== "restapi") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(stored)) {
      result[key] = isEncryptedValue(value) ? decrypt(value) : value
    }
    return result as ResourceConfigValue
  }

  const restapiStored = stored as StoredRestApiConfig
  let auth: RestApiConfig["auth"] = { type: "none" }

  if (restapiStored.authConfig && isEncryptedValue(restapiStored.authConfig)) {
    const decrypted = JSON.parse(decrypt(restapiStored.authConfig))
    switch (decrypted.type) {
      case "api_key":
        auth = {
          type: "api_key",
          key: decrypted.key,
          location: restapiStored.authLocation ?? "header",
          name: restapiStored.authName ?? "X-API-Key",
        }
        break
      case "bearer":
        auth = { type: "bearer", token: decrypted.token }
        break
      case "basic":
        auth = { type: "basic", username: decrypted.username, password: decrypted.password }
        break
    }
  }

  return {
    baseUrl: restapiStored.baseUrl,
    auth,
    headers: restapiStored.headers,
    queryParams: restapiStored.queryParams,
  } as RestApiConfig
}

const MANAGED_RESOURCES: Record<string, { name: string; slug: string; type: ResourceType }> = {
  synatra_ai: { name: "Synatra AI", slug: "synatra_ai", type: "synatra_ai" },
}

function mapConfigWithEnvironment(c: {
  id: string
  environmentId: string
  config: StoredResourceConfig
  connectionMode: ConnectionMode | null
  connectorId: string | null
  environment: { id: string; name: string; slug: string; color: string | null }
}) {
  return {
    id: c.id,
    environmentId: c.environmentId,
    environmentName: c.environment.name,
    environmentSlug: c.environment.slug,
    environmentColor: c.environment.color,
    config: c.config,
    connectionMode: c.connectionMode ?? "direct",
    connectorId: c.connectorId,
  }
}

async function getConfigsForResource(resourceId: string) {
  return withDb((db) =>
    db
      .select({
        id: ResourceConfigTable.id,
        environmentId: ResourceConfigTable.environmentId,
        config: ResourceConfigTable.config,
        connectionMode: ResourceConfigTable.connectionMode,
        connectorId: ResourceConfigTable.connectorId,
        environment: {
          id: EnvironmentTable.id,
          name: EnvironmentTable.name,
          slug: EnvironmentTable.slug,
          color: EnvironmentTable.color,
        },
      })
      .from(ResourceConfigTable)
      .innerJoin(EnvironmentTable, eq(ResourceConfigTable.environmentId, EnvironmentTable.id))
      .where(eq(ResourceConfigTable.resourceId, resourceId)),
  )
}

async function resolveGitHubConfig(
  config: GitHubConfig,
  connectionMode: ConnectionMode,
  connectorId: string | null,
): Promise<ExecutionConfig | null> {
  const appAccount = await withDb((db) =>
    db
      .select({ credentials: AppAccountTable.credentials })
      .from(AppAccountTable)
      .where(eq(AppAccountTable.id, config.appAccountId))
      .then(first),
  )
  if (!appAccount) return null
  const creds = appAccount.credentials as GitHubAppCredentials | null
  if (!creds || creds.type !== "github_app") return null
  return {
    type: "github",
    config: {
      appAccountId: config.appAccountId,
      installationId: creds.installationId,
      cachedToken: creds.cachedToken && isEncryptedValue(creds.cachedToken) ? decrypt(creds.cachedToken) : null,
      tokenExpiresAt: creds.tokenExpiresAt ?? null,
    },
    connectionMode,
    connectorId,
  }
}

async function resolveIntercomConfig(
  config: IntercomConfig,
  connectionMode: ConnectionMode,
  connectorId: string | null,
): Promise<ExecutionConfig | null> {
  const appAccount = await withDb((db) =>
    db
      .select({ credentials: AppAccountTable.credentials })
      .from(AppAccountTable)
      .where(eq(AppAccountTable.id, config.appAccountId))
      .then(first),
  )
  if (!appAccount) return null
  const creds = appAccount.credentials as OAuthCredentials | null
  if (!creds || creds.type !== "oauth" || !creds.accessToken || !isEncryptedValue(creds.accessToken)) return null
  return {
    type: "intercom",
    config: { appAccountId: config.appAccountId, accessToken: decrypt(creds.accessToken) },
    connectionMode,
    connectorId,
  }
}

export async function ensureManagedResource(input: z.input<typeof EnsureManagedResourceSchema>) {
  const type = EnsureManagedResourceSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.actingUserId()
  const config = MANAGED_RESOURCES[type]

  const existing = await withDb((db) =>
    db
      .select()
      .from(ResourceTable)
      .where(
        and(
          eq(ResourceTable.organizationId, organizationId),
          eq(ResourceTable.type, type),
          eq(ResourceTable.managed, true),
        ),
      )
      .then(first),
  )
  if (existing) return existing

  const [created] = await withDb((db) =>
    db
      .insert(ResourceTable)
      .values({
        organizationId,
        name: config.name,
        slug: config.slug,
        type: config.type,
        managed: true,
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoNothing()
      .returning(),
  )

  if (created) return created

  return withDb((db) =>
    db
      .select()
      .from(ResourceTable)
      .where(
        and(
          eq(ResourceTable.organizationId, organizationId),
          eq(ResourceTable.type, type),
          eq(ResourceTable.managed, true),
        ),
      )
      .then(first),
  ).then((r) => r!)
}

export async function getManagedResourceWithConfigs(input: z.input<typeof GetManagedResourceWithConfigsSchema>) {
  const type = GetManagedResourceWithConfigsSchema.parse(input)
  const organizationId = principal.orgId()
  const resource = await withDb((db) =>
    db
      .select()
      .from(ResourceTable)
      .where(
        and(
          eq(ResourceTable.organizationId, organizationId),
          eq(ResourceTable.type, type),
          eq(ResourceTable.managed, true),
        ),
      )
      .then(first),
  )
  if (!resource) return null

  const configs = await getConfigsForResource(resource.id)
  return { ...resource, configs: configs.map(mapConfigWithEnvironment) }
}

export async function listResources() {
  const organizationId = principal.orgId()
  return withDb((db) => db.select().from(ResourceTable).where(eq(ResourceTable.organizationId, organizationId)))
}

export async function listResourcesWithConfigs() {
  const organizationId = principal.orgId()
  const resources = await withDb((db) =>
    db.select().from(ResourceTable).where(eq(ResourceTable.organizationId, organizationId)),
  )

  return Promise.all(
    resources.map(async (resource) => {
      const configs = await getConfigsForResource(resource.id)
      return { ...resource, configs: configs.map(mapConfigWithEnvironment) }
    }),
  )
}

export async function findResourceById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(ResourceTable)
      .where(and(eq(ResourceTable.id, id), eq(ResourceTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function getResourceById(id: string) {
  const resource = await findResourceById(id)
  if (!resource) throw createError("NotFoundError", { type: "Resource", id })
  return resource
}

export async function getResourceByIdWithConfigs(id: string) {
  const resource = await getResourceById(id)
  const configs = await getConfigsForResource(resource.id)
  return { ...resource, configs: configs.map(mapConfigWithEnvironment) }
}

export async function findResourceBySlug(slug: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(ResourceTable)
      .where(and(eq(ResourceTable.organizationId, organizationId), eq(ResourceTable.slug, slug)))
      .then(first),
  )
}

export async function getResourceConfig(input: z.input<typeof GetResourceConfigSchema>) {
  const data = GetResourceConfigSchema.parse(input)
  const resource = await findResourceById(data.resourceId)
  if (!resource) return null

  const environment = await withDb((db) =>
    db.select().from(EnvironmentTable).where(eq(EnvironmentTable.id, data.environmentId)).then(first),
  )
  if (!environment || environment.organizationId !== resource.organizationId) return null

  const cfg = await withDb((db) =>
    db
      .select()
      .from(ResourceConfigTable)
      .where(
        and(
          eq(ResourceConfigTable.resourceId, data.resourceId),
          eq(ResourceConfigTable.environmentId, data.environmentId),
        ),
      )
      .then(first),
  )
  if (!cfg) return null
  return { type: resource.type, config: decryptSensitiveFields(resource.type, cfg.config) }
}

export async function createResource(input: z.input<typeof CreateResourceSchema>) {
  const data = CreateResourceSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const slug = data.slug?.trim() || generateSlug(data.name)

  const [resource] = await withDb((db) =>
    db
      .insert(ResourceTable)
      .values({
        organizationId,
        name: data.name,
        slug,
        managed: data.managed ?? false,
        description: data.description ?? null,
        type: data.type,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning(),
  )

  const configs = data.configs ?? []
  if (configs.length > 0) {
    await withDb((db) =>
      db.insert(ResourceConfigTable).values(
        configs.map((c) => ({
          resourceId: resource.id,
          environmentId: c.environmentId,
          config: encryptSensitiveFields(data.type, c.config as InputResourceConfig),
          createdBy: userId,
          updatedBy: userId,
        })),
      ),
    )
  }

  return resource
}

export async function updateResource(input: z.input<typeof UpdateResourceSchema>) {
  const data = UpdateResourceSchema.parse(input)
  await getResourceById(data.id)
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: principal.userId(),
  }

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.description !== undefined) updateData.description = data.description

  const [resource] = await withDb((db) =>
    db.update(ResourceTable).set(updateData).where(eq(ResourceTable.id, data.id)).returning(),
  )

  return resource
}

export async function removeResource(id: string) {
  const resource = await getResourceById(id)
  if (resource.managed) throw createError("BadRequestError", { message: "Managed resources cannot be deleted" })
  const [deleted] = await withDb((db) =>
    db.delete(ResourceTable).where(eq(ResourceTable.id, id)).returning({ id: ResourceTable.id }),
  )
  return deleted
}

export async function upsertResourceConfig(input: z.input<typeof UpsertResourceConfigSchema>) {
  const data = UpsertResourceConfigSchema.parse(input)
  const userId = principal.userId()
  const organizationId = principal.orgId()
  const resource = await getResourceById(data.resourceId)

  const environment = await withDb((db) =>
    db
      .select({ id: EnvironmentTable.id, organizationId: EnvironmentTable.organizationId })
      .from(EnvironmentTable)
      .where(eq(EnvironmentTable.id, data.environmentId))
      .then(first),
  )
  if (!environment || environment.organizationId !== organizationId)
    throw createError("NotFoundError", { type: "Environment", id: data.environmentId })

  const connectorId = data.connectorId ?? null
  if (connectorId) {
    const connector = await withDb((db) =>
      db
        .select({ id: ConnectorTable.id })
        .from(ConnectorTable)
        .where(and(eq(ConnectorTable.id, connectorId), eq(ConnectorTable.organizationId, organizationId)))
        .then(first),
    )
    if (!connector) throw createError("NotFoundError", { type: "Connector", id: connectorId })
  }

  if (
    (resource.type === "github" || resource.type === "intercom") &&
    (data.config as { appAccountId?: string })?.appAccountId
  ) {
    const appAccountId = (data.config as { appAccountId: string }).appAccountId
    const appAccount = await withDb((db) =>
      db
        .select({ id: AppAccountTable.id })
        .from(AppAccountTable)
        .where(and(eq(AppAccountTable.id, appAccountId), eq(AppAccountTable.organizationId, organizationId)))
        .then(first),
    )
    if (!appAccount) throw createError("NotFoundError", { type: "AppAccount", id: appAccountId })
  }

  const existing = await withDb((db) =>
    db
      .select()
      .from(ResourceConfigTable)
      .where(
        and(
          eq(ResourceConfigTable.resourceId, data.resourceId),
          eq(ResourceConfigTable.environmentId, data.environmentId),
        ),
      )
      .then(first),
  )

  const encryptedConfig = encryptSensitiveFields(resource.type, data.config as InputResourceConfig, existing?.config)

  if (existing) {
    const [updated] = await withDb((db) =>
      db
        .update(ResourceConfigTable)
        .set({
          config: encryptedConfig,
          updatedBy: userId,
          updatedAt: new Date(),
          ...(data.connectionMode !== undefined && { connectionMode: data.connectionMode }),
          ...(data.connectorId !== undefined && { connectorId: data.connectorId }),
        })
        .where(eq(ResourceConfigTable.id, existing.id))
        .returning(),
    )
    return updated
  }

  const [created] = await withDb((db) =>
    db
      .insert(ResourceConfigTable)
      .values({
        resourceId: data.resourceId,
        environmentId: data.environmentId,
        config: encryptedConfig,
        connectionMode: data.connectionMode ?? "direct",
        connectorId: data.connectorId ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning(),
  )
  return created
}

export async function removeResourceConfig(input: z.input<typeof RemoveResourceConfigSchema>) {
  const data = RemoveResourceConfigSchema.parse(input)
  await getResourceById(data.resourceId)

  const [deleted] = await withDb((db) =>
    db
      .delete(ResourceConfigTable)
      .where(
        and(
          eq(ResourceConfigTable.resourceId, data.resourceId),
          eq(ResourceConfigTable.environmentId, data.environmentId),
        ),
      )
      .returning({ id: ResourceConfigTable.id }),
  )
  return deleted
}

export async function getResourceProviderConfig(input: z.input<typeof GetResourceProviderConfigSchema>) {
  const data = GetResourceProviderConfigSchema.parse(input)
  const organizationId = principal.orgId()
  const resource = await withDb((db) =>
    db
      .select()
      .from(ResourceTable)
      .where(
        and(
          eq(ResourceTable.organizationId, organizationId),
          eq(ResourceTable.type, "synatra_ai"),
          eq(ResourceTable.managed, true),
        ),
      )
      .then(first),
  )
  if (!resource) return null

  const cfg = await withDb((db) =>
    db
      .select()
      .from(ResourceConfigTable)
      .where(
        and(eq(ResourceConfigTable.resourceId, resource.id), eq(ResourceConfigTable.environmentId, data.environmentId)),
      )
      .then(first),
  )
  if (!cfg) return null

  const decrypted = decryptSensitiveFields("synatra_ai", cfg.config) as SynatraAiConfig
  const config = decrypted[data.provider]
  return config?.enabled ? config : null
}

export async function getResourceExecutionConfig(
  input: z.input<typeof GetResourceExecutionConfigSchema>,
): Promise<ExecutionConfig | null> {
  const data = GetResourceExecutionConfigSchema.parse(input)
  const organizationId = principal.orgId()
  const row = await withDb((db) =>
    db
      .select({
        type: ResourceTable.type,
        organizationId: ResourceTable.organizationId,
        config: ResourceConfigTable.config,
        connectionMode: ResourceConfigTable.connectionMode,
        connectorId: ResourceConfigTable.connectorId,
      })
      .from(ResourceConfigTable)
      .innerJoin(ResourceTable, eq(ResourceConfigTable.resourceId, ResourceTable.id))
      .where(
        and(
          eq(ResourceConfigTable.resourceId, data.resourceId),
          eq(ResourceConfigTable.environmentId, data.environmentId),
          eq(ResourceTable.organizationId, organizationId),
        ),
      )
      .then(first),
  )
  if (!row) return null

  const decrypted = decryptSensitiveFields(row.type, row.config)
  const connectionMode = (row.connectionMode ?? "direct") as ConnectionMode
  let connectorId = row.connectorId ?? null
  const connectorIdValue = connectorId
  if (connectorIdValue) {
    const connector = await withDb((db) =>
      db
        .select({ organizationId: ConnectorTable.organizationId })
        .from(ConnectorTable)
        .where(eq(ConnectorTable.id, connectorIdValue))
        .then(first),
    )
    if (!connector || connector.organizationId !== row.organizationId) connectorId = null
  }

  switch (row.type) {
    case "postgres":
      return { type: "postgres", config: decrypted as PostgresConfig, connectionMode, connectorId }
    case "mysql":
      return { type: "mysql", config: decrypted as MysqlConfig, connectionMode, connectorId }
    case "stripe":
      return { type: "stripe", config: decrypted as StripeConfig, connectionMode, connectorId }
    case "github":
      return resolveGitHubConfig(decrypted as GitHubConfig, connectionMode, connectorId)
    case "intercom":
      return resolveIntercomConfig(decrypted as IntercomConfig, connectionMode, connectorId)
    case "restapi":
      return { type: "restapi", config: decrypted as RestApiConfig, connectionMode, connectorId }
    default:
      throw createError("BadRequestError", { message: `Unsupported resource type: ${row.type}` })
  }
}
