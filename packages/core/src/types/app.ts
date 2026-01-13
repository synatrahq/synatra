import { z } from "zod"

export const AppId = ["intercom", "github"] as const
export type AppId = (typeof AppId)[number]

export const IntercomEvent = [
  "conversation.user.created",
  "conversation.user.replied",
  "conversation.admin.replied",
  "conversation.admin.closed",
] as const
export type IntercomEvent = (typeof IntercomEvent)[number]

export const GitHubEvent = [
  "push",
  "create.branch",
  "create.tag",
  "delete.branch",
  "delete.tag",
  "pull_request.opened",
  "pull_request.merged",
  "pull_request.closed",
  "pull_request.reopened",
  "pull_request.synchronize",
  "pull_request.ready_for_review",
  "issues.opened",
  "issues.closed",
  "issues.reopened",
  "issue_comment.created",
  "pull_request_comment.created",
  "pull_request_review.approved",
  "pull_request_review.changes_requested",
  "pull_request_review.commented",
  "release.published",
] as const
export type GitHubEvent = (typeof GitHubEvent)[number]

export type AppEvent = IntercomEvent | GitHubEvent

export type AppEventDefinition = {
  id: string
  name: string
  description: string
}

export type AppDefinition = {
  id: AppId
  name: string
  authType: "oauth2" | "api_key" | "github_app"
  oauth?: {
    authUrl: string
    tokenUrl: string
    scopes: string[]
  }
  events: AppEventDefinition[]
  webhookSecretHeader?: string
}

const EncryptedValueSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
})

export const OAuthCredentialsSchema = z.object({
  type: z.literal("oauth"),
  accessToken: z.union([z.string(), EncryptedValueSchema]),
  refreshToken: z.union([z.string(), EncryptedValueSchema]).nullable().optional(),
  expiresAt: z.number().optional(),
})
export type OAuthCredentials = z.infer<typeof OAuthCredentialsSchema>

export const GitHubAppCredentialsSchema = z.object({
  type: z.literal("github_app"),
  installationId: z.string(),
  cachedToken: z.union([z.string(), EncryptedValueSchema]).nullable().optional(),
  tokenExpiresAt: z.string().nullable().optional(),
})
export type GitHubAppCredentials = z.infer<typeof GitHubAppCredentialsSchema>

export const AppAccountCredentialsSchema = z.discriminatedUnion("type", [
  OAuthCredentialsSchema,
  GitHubAppCredentialsSchema,
])
export type AppAccountCredentials = z.infer<typeof AppAccountCredentialsSchema>

export const IntercomMetadataSchema = z.object({
  workspaceName: z.string().optional(),
  workspaceId: z.string().optional(),
})
export type IntercomMetadata = z.infer<typeof IntercomMetadataSchema>

export const GitHubMetadataSchema = z.object({
  accountLogin: z.string(),
  accountType: z.enum(["User", "Organization"]),
})
export type GitHubMetadata = z.infer<typeof GitHubMetadataSchema>

export const AppAccountMetadataSchema = z.union([IntercomMetadataSchema, GitHubMetadataSchema])
export type AppAccountMetadata = z.infer<typeof AppAccountMetadataSchema>
