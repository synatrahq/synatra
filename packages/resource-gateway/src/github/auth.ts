import { createAppAuth } from "@octokit/auth-app"
import { updateAppAccountGitHubToken } from "@synatra/core"
import { config } from "../config"

const TOKEN_BUFFER_MS = 5 * 60 * 1000
const GITHUB_TIMEOUT_MS = 60000
const pendingTokenRequests = new Map<string, Promise<string>>()

function getGitHubConfig() {
  const gatewayConfig = config()
  if (!gatewayConfig.github) {
    throw new Error("GitHub App not configured: GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required")
  }
  return gatewayConfig.github
}

export async function getInstallationToken(
  appAccountId: string,
  installationId: string,
  cachedToken: string | null,
  tokenExpiresAt: string | null,
): Promise<string> {
  if (cachedToken && tokenExpiresAt) {
    const expiresAt = new Date(tokenExpiresAt).getTime()
    if (expiresAt > Date.now() + TOKEN_BUFFER_MS) {
      return cachedToken
    }
  }

  const key = `${appAccountId}:${installationId}`
  const pending = pendingTokenRequests.get(key)
  if (pending) return pending

  const promise = (async () => {
    const installationIdNum = Number(installationId)
    if (!Number.isInteger(installationIdNum) || installationIdNum <= 0) {
      throw new Error(`Invalid installation ID: ${installationId}`)
    }

    const config = getGitHubConfig()
    const auth = createAppAuth({
      appId: config.appId,
      privateKey: config.privateKey,
    })

    const { token, expiresAt } = await auth({
      type: "installation",
      installationId: installationIdNum,
    })

    await updateAppAccountGitHubToken({ appAccountId, token, expiresAt })

    return token
  })()

  pendingTokenRequests.set(key, promise)
  promise.finally(() => pendingTokenRequests.delete(key))

  return promise
}

export async function githubRequest(
  appAccountId: string,
  installationId: string,
  cachedToken: string | null,
  tokenExpiresAt: string | null,
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<unknown> {
  const token = await getInstallationToken(appAccountId, installationId, cachedToken, tokenExpiresAt)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS)

  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId))

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`GitHub API error: ${res.status} ${error}`)
  }

  if (res.status === 204) {
    return null
  }

  return res.json()
}
