import { z } from "zod"
import { githubRequest } from "./auth"
import type { GitHubResource } from "../types"

export const githubOperation = z.object({
  type: z.literal("github"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  endpoint: z
    .string()
    .refine((s) => s.startsWith("/") && !s.includes("@") && !s.includes("//"), "Invalid endpoint format"),
  body: z.unknown().optional(),
})

export type GitHubOperation = z.infer<typeof githubOperation>

interface OperationResult {
  data: unknown
}

export async function executeGitHubOperation(
  resource: GitHubResource,
  operation: GitHubOperation,
): Promise<OperationResult> {
  const { config } = resource
  const { appAccountId, installationId, cachedToken, tokenExpiresAt } = config

  const data = await githubRequest(
    appAccountId,
    installationId,
    cachedToken,
    tokenExpiresAt,
    operation.method,
    operation.endpoint,
    operation.body,
  )

  return { data }
}
