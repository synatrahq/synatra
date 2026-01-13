import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, first } from "./database"
import { createError } from "@synatra/util/error"
import { AppAccountTable, appIdEnum } from "./schema/app-account.sql"
import { decrypt, encrypt, isEncryptedValue, type EncryptedValue } from "@synatra/util/crypto"
import type { AppId, OAuthCredentials, GitHubAppCredentials, AppAccountCredentials } from "./types"
import type { GitHubTokenInfo } from "./types"

type OAuthInput = {
  type: "oauth"
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

type GitHubAppInput = {
  type: "github_app"
  installationId: string
}

type CredentialsInput = OAuthInput | GitHubAppInput

function encryptCredentials(input: CredentialsInput): AppAccountCredentials {
  if (input.type === "oauth") {
    return {
      type: "oauth",
      accessToken: encrypt(input.accessToken),
      refreshToken: input.refreshToken ? encrypt(input.refreshToken) : null,
      expiresAt: input.expiresAt,
    }
  }
  return {
    type: "github_app",
    installationId: input.installationId,
    cachedToken: null,
    tokenExpiresAt: null,
  }
}

function decryptCredentials(stored: unknown): CredentialsInput | null {
  if (!stored || typeof stored !== "object") return null
  const s = stored as Record<string, unknown>

  if (s.type === "github_app") {
    if (typeof s.installationId !== "string") return null
    return {
      type: "github_app",
      installationId: s.installationId,
    }
  }

  if (!isEncryptedValue(s.accessToken)) return null
  return {
    type: "oauth",
    accessToken: decrypt(s.accessToken as EncryptedValue),
    refreshToken: isEncryptedValue(s.refreshToken) ? decrypt(s.refreshToken as EncryptedValue) : undefined,
    expiresAt: typeof s.expiresAt === "number" ? s.expiresAt : undefined,
  }
}

const oauthCredentialsSchema = z.object({
  type: z.literal("oauth"),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
})

const githubCredentialsSchema = z.object({
  type: z.literal("github_app"),
  installationId: z.string(),
})

const credentialsSchema = z.discriminatedUnion("type", [oauthCredentialsSchema, githubCredentialsSchema])

export const CreateAppAccountSchema = z.object({
  appId: z.enum(appIdEnum.enumValues),
  name: z.string().min(1),
  credentials: credentialsSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const UpdateAppAccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  credentials: credentialsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const UpdateAppAccountGitHubTokenSchema = z.object({
  appAccountId: z.string(),
  token: z.string(),
  expiresAt: z.string(),
})

export async function listAppAccounts() {
  const organizationId = principal.orgId()
  return withDb((db) => db.select().from(AppAccountTable).where(eq(AppAccountTable.organizationId, organizationId)))
}

export async function findAppAccountById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(AppAccountTable)
      .where(and(eq(AppAccountTable.id, id), eq(AppAccountTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function getAppAccountById(id: string) {
  const account = await findAppAccountById(id)
  if (!account) throw createError("NotFoundError", { type: "AppAccount", id })
  return account
}

export async function findAppAccountsByAppIdAndWorkspaceId(appId: AppId, workspaceId: string) {
  return withDb((db) =>
    db
      .select()
      .from(AppAccountTable)
      .where(eq(AppAccountTable.appId, appId))
      .then((rows) => rows.filter((r) => (r.metadata as { workspaceId?: string })?.workspaceId === workspaceId)),
  )
}

export async function findAppAccountsByAppIdAndInstallationId(appId: AppId, installationId: string) {
  return withDb((db) =>
    db
      .select()
      .from(AppAccountTable)
      .where(eq(AppAccountTable.appId, appId))
      .then((rows) =>
        rows.filter((r) => {
          const creds = r.credentials as { type?: string; installationId?: string }
          return creds?.type === "github_app" && creds?.installationId === installationId
        }),
      ),
  )
}

export async function createAppAccount(input: z.input<typeof CreateAppAccountSchema>) {
  const data = CreateAppAccountSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const [account] = await withDb((db) =>
    db
      .insert(AppAccountTable)
      .values({
        organizationId,
        appId: data.appId,
        name: data.name,
        credentials: encryptCredentials(data.credentials),
        metadata: data.metadata,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning(),
  )

  return account
}

export async function updateAppAccount(input: z.input<typeof UpdateAppAccountSchema>) {
  const data = UpdateAppAccountSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: userId,
  }

  if (data.name !== undefined) updateData.name = data.name
  if (data.credentials !== undefined) updateData.credentials = encryptCredentials(data.credentials)
  if (data.metadata !== undefined) updateData.metadata = data.metadata

  const [account] = await withDb((db) =>
    db
      .update(AppAccountTable)
      .set(updateData)
      .where(and(eq(AppAccountTable.id, data.id), eq(AppAccountTable.organizationId, organizationId)))
      .returning(),
  )

  return account
}

export async function removeAppAccount(id: string) {
  const organizationId = principal.orgId()
  const [deleted] = await withDb((db) =>
    db
      .delete(AppAccountTable)
      .where(and(eq(AppAccountTable.id, id), eq(AppAccountTable.organizationId, organizationId)))
      .returning({ id: AppAccountTable.id }),
  )
  return deleted
}

export async function getAppAccountCredentials(id: string) {
  const organizationId = principal.orgId()

  const account = await withDb((db) =>
    db
      .select()
      .from(AppAccountTable)
      .where(and(eq(AppAccountTable.id, id), eq(AppAccountTable.organizationId, organizationId)))
      .then(first),
  )
  if (!account) return null
  return decryptCredentials(account.credentials)
}

export async function getAppAccountGitHubTokenInfo(appAccountId: string): Promise<GitHubTokenInfo | null> {
  const organizationId = principal.orgId()

  const account = await withDb((db) =>
    db
      .select({ credentials: AppAccountTable.credentials })
      .from(AppAccountTable)
      .where(and(eq(AppAccountTable.id, appAccountId), eq(AppAccountTable.organizationId, organizationId)))
      .then(first),
  )
  if (!account) return null

  const creds = account.credentials as GitHubAppCredentials | null
  if (!creds || creds.type !== "github_app") return null

  return {
    installationId: creds.installationId,
    cachedToken: creds.cachedToken && isEncryptedValue(creds.cachedToken) ? decrypt(creds.cachedToken) : null,
    tokenExpiresAt: creds.tokenExpiresAt ?? null,
  }
}

export async function updateAppAccountGitHubToken(
  input: z.input<typeof UpdateAppAccountGitHubTokenSchema>,
): Promise<void> {
  const data = UpdateAppAccountGitHubTokenSchema.parse(input)
  const organizationId = principal.orgId()

  const account = await withDb((db) =>
    db
      .select({ credentials: AppAccountTable.credentials })
      .from(AppAccountTable)
      .where(and(eq(AppAccountTable.id, data.appAccountId), eq(AppAccountTable.organizationId, organizationId)))
      .then(first),
  )
  if (!account) return

  const creds = account.credentials as GitHubAppCredentials | null
  if (!creds || creds.type !== "github_app") return

  const updated: GitHubAppCredentials = {
    ...creds,
    cachedToken: encrypt(data.token),
    tokenExpiresAt: data.expiresAt,
  }

  await withDb((db) =>
    db
      .update(AppAccountTable)
      .set({ credentials: updated, updatedAt: new Date() })
      .where(and(eq(AppAccountTable.id, data.appAccountId), eq(AppAccountTable.organizationId, organizationId))),
  )
}
