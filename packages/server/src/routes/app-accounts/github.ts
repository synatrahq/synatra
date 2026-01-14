import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { setCookie, getCookie } from "hono/cookie"
import { createAppAuth } from "@octokit/auth-app"
import { createAppAccount, principal } from "@synatra/core"
import { config } from "../../config"
import { principalMiddleware, requireAuth, requireOrganization } from "../../middleware/principal"
import { signState, verifyState } from "../../util/signed-state"
import { createError } from "@synatra/util/error"

const githubStateSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  returnUrl: z.string().optional(),
})

type InstallationAccount = {
  id: number
  login: string
  type: "User" | "Organization"
}

type Installation = {
  id: number
  account: InstallationAccount
}

const startSchema = z.object({
  name: z.string().min(1),
  returnUrl: z.string().optional(),
})

export const githubCallback = new Hono().get("/callback", async (c) => {
  const installationId = c.req.query("installation_id")
  const setupAction = c.req.query("setup_action")
  const consoleUrl = config().console.url

  if (!installationId) {
    return c.redirect(`${consoleUrl}/settings/apps?error=missing_installation_id`)
  }

  if (setupAction === "request") {
    return c.redirect(`${consoleUrl}/settings/apps?error=installation_request_pending`)
  }

  const stateCookie = getCookie(c, "github_install_state")
  if (!stateCookie) {
    return c.redirect(`${consoleUrl}/settings/apps?error=missing_state`)
  }

  const stateData = verifyState(stateCookie, githubStateSchema)
  if (!stateData) {
    return c.redirect(`${consoleUrl}/settings/apps?error=invalid_state`)
  }

  const github = config().github
  if (!github) {
    return c.redirect(`${consoleUrl}/settings/apps?error=github_not_configured`)
  }

  const auth = createAppAuth({
    appId: github.appId,
    privateKey: github.privateKey,
  })

  const { token } = await auth({ type: "app" })

  let installation: Installation
  try {
    const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })

    if (!res.ok) {
      const error = await res.text()
      console.error("Failed to fetch installation:", error)
      return c.redirect(`${consoleUrl}/settings/apps?error=installation_fetch_failed`)
    }

    installation = (await res.json()) as Installation
  } catch (err) {
    console.error("GitHub API error:", err)
    return c.redirect(`${consoleUrl}/settings/apps?error=github_api_error`)
  }

  const appAccount = await principal.withUser(
    { organizationId: stateData.organizationId, userId: stateData.userId, email: stateData.email },
    async () => {
      return await createAppAccount({
        appId: "github",
        name: stateData.name,
        credentials: {
          type: "github_app",
          installationId,
        },
        metadata: {
          accountLogin: installation.account.login,
          accountType: installation.account.type,
        },
      })
    },
  )

  setCookie(c, "github_install_state", "", { maxAge: 0, path: "/" })

  if (stateData.returnUrl && URL.canParse(stateData.returnUrl)) {
    const url = new URL(stateData.returnUrl)
    const consoleOrigin = new URL(consoleUrl).origin
    if (url.origin === consoleOrigin) {
      url.searchParams.set("newAppAccountId", appAccount.id)
      return c.redirect(url.toString())
    }
  }

  return c.redirect(`${consoleUrl}/settings/apps?success=true`)
})

export const github = new Hono().post(
  "/github/start",
  principalMiddleware,
  requireAuth,
  requireOrganization,
  zValidator("json", startSchema),
  async (c) => {
    const cfg = config().github
    if (!cfg) throw createError("BadRequestError", { message: "GitHub integration not configured" })

    const actor = principal.requireKind("user")
    const { name, returnUrl } = c.req.valid("json")

    const state = signState({
      organizationId: actor.organizationId,
      userId: actor.userId,
      email: actor.email,
      name,
      returnUrl,
    })

    setCookie(c, "github_install_state", state, {
      httpOnly: true,
      secure: !config().app.isDevelopment,
      sameSite: "Lax",
      maxAge: 600,
      path: "/",
      domain: config().app.cookieDomain,
    })

    return c.json({ url: `https://github.com/apps/${cfg.appSlug}/installations/new` })
  },
)
