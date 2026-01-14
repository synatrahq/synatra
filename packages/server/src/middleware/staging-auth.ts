import { createMiddleware } from "hono/factory"
import { timingSafeEqual } from "crypto"

type StagingAuthConfig = {
  enabled: boolean
  user: string
  password: string
}

let _config: StagingAuthConfig | null = null

function getConfig(): StagingAuthConfig {
  if (_config) return _config

  const enabled = process.env.STAGING_AUTH === "true"
  const user = process.env.STAGING_USER ?? ""
  const password = process.env.STAGING_PASSWORD ?? ""

  _config = { enabled, user, password }
  return _config
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const BYPASS_PATHS = [
  "/api/health",
  "/api/webhook",
  "/api/app",
  "/api/triggers/",
  "/api/subscriptions/webhook",
  "/api/app-accounts/oauth",
  "/api/app-accounts/github",
]

function shouldBypass(path: string): boolean {
  return BYPASS_PATHS.some((p) => path === p || path.startsWith(p))
}

export const stagingAuth = createMiddleware(async (c, next) => {
  const config = getConfig()
  if (!config.enabled) return next()

  const path = c.req.path
  if (shouldBypass(path)) return next()

  const auth = c.req.header("Authorization")
  if (!auth?.startsWith("Basic ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Staging Environment"',
        "X-Robots-Tag": "noindex, nofollow",
      },
    })
  }

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8")
  const separatorIndex = decoded.indexOf(":")
  if (separatorIndex === -1) {
    return new Response("Unauthorized", { status: 401 })
  }

  const user = decoded.slice(0, separatorIndex)
  const password = decoded.slice(separatorIndex + 1)

  if (!safeCompare(user, config.user) || !safeCompare(password, config.password)) {
    return new Response("Unauthorized", { status: 401 })
  }

  return next()
})

export const noIndex = createMiddleware(async (c, next) => {
  const config = getConfig()
  if (config.enabled) {
    c.header("X-Robots-Tag", "noindex, nofollow")
  }
  return next()
})
