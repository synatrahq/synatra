import { z } from "zod"
import { githubRequest } from "./auth"
import type { GitHubResource } from "../types"

export const githubOperation = z.object({
  type: z.literal("github"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  endpoint: z
    .string()
    .refine((s) => s.startsWith("/") && !s.includes("@") && !s.includes("//"), "Invalid endpoint format"),
  queryParams: z.record(z.string(), z.string()).optional(),
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

  let endpoint = operation.endpoint
  if (operation.queryParams && Object.keys(operation.queryParams).length > 0) {
    const params = new URLSearchParams(operation.queryParams).toString()
    endpoint = endpoint.includes("?") ? `${endpoint}&${params}` : `${endpoint}?${params}`
  }

  const data = await githubRequest(
    appAccountId,
    installationId,
    cachedToken,
    tokenExpiresAt,
    operation.method,
    endpoint,
    operation.body,
  )

  return { data }
}
