import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { createAppAccount, principal } from "@synatra/core"
import { getApp } from "../../apps"
import { config } from "../../config"
import { signState, verifyState } from "../../util/signed-state"
import { createError } from "@synatra/util/error"

const oauthStateSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  email: z.string(),
  appId: z.enum(["intercom"]),
  name: z.string(),
  returnUrl: z.string().optional(),
})

const startSchema = z.object({
  appId: z.enum(["intercom"]),
  name: z.string().min(1),
  returnUrl: z.string().optional(),
})

export const oauthCallback = new Hono().get("/callback", async (c) => {
  const code = c.req.query("code")
  const state = c.req.query("state")
  const error = c.req.query("error")

  if (error) {
    return c.redirect(`${config().console.url}/settings/apps?error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return c.redirect(`${config().console.url}/settings/apps?error=missing_params`)
  }

  const stateData = verifyState(state, oauthStateSchema)
  if (!stateData) {
    return c.redirect(`${config().console.url}/settings/apps?error=invalid_state`)
  }

  const app = getApp(stateData.appId)
  if (!app || !app.oauth) {
    return c.redirect(`${config().console.url}/settings/apps?error=invalid_app`)
  }

  let tokenRes: Response
  try {
    tokenRes = await fetch(app.oauth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config().oauth[stateData.appId]?.clientId ?? "",
        client_secret: config().oauth[stateData.appId]?.clientSecret ?? "",
        code,
        redirect_uri: `${config().app.url}/api/app-accounts/oauth/callback`,
        grant_type: "authorization_code",
      }),
    })
  } catch {
    return c.redirect(`${config().console.url}/settings/apps?error=token_fetch_failed`)
  }

  if (!tokenRes.ok) {
    return c.redirect(`${config().console.url}/settings/apps?error=token_exchange_failed`)
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type: string
    workspace_id?: string
  }

  let workspaceName: string | undefined
  if (tokenData.access_token) {
    try {
      const meRes = await fetch("https://api.intercom.io/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      if (meRes.ok) {
        const meData = (await meRes.json()) as { app?: { name?: string } }
        workspaceName = meData.app?.name
      }
    } catch {}
  }

  const appAccount = await principal.withUser(
    { organizationId: stateData.organizationId, userId: stateData.userId, email: stateData.email },
    async () => {
      return await createAppAccount({
        appId: stateData.appId,
        name: stateData.name,
        credentials: {
          type: "oauth" as const,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
        },
        metadata: {
          workspaceId: tokenData.workspace_id,
          workspaceName,
        },
      })
    },
  )

  if (stateData.returnUrl) {
    try {
      const url = new URL(stateData.returnUrl)
      const consoleOrigin = new URL(config().console.url).origin
      if (url.origin === consoleOrigin) {
        url.searchParams.set("newAppAccountId", appAccount.id)
        return c.redirect(url.toString())
      }
    } catch {}
  }

  return c.redirect(`${config().console.url}/settings/apps?success=true`)
})

export const oauth = new Hono().post("/oauth/start", zValidator("json", startSchema), async (c) => {
  const { appId, name, returnUrl } = c.req.valid("json")
  const app = getApp(appId)

  if (!app || app.authType !== "oauth2" || !app.oauth) {
    throw createError("BadRequestError", { message: "App does not support OAuth" })
  }

  const actor = principal.requireKind("user")
  const state = signState({
    organizationId: actor.organizationId,
    userId: actor.userId,
    email: actor.email,
    appId,
    name,
    returnUrl,
  })

  const params = new URLSearchParams({
    client_id: config().oauth[appId]?.clientId ?? "",
    redirect_uri: `${config().app.url}/api/app-accounts/oauth/callback`,
    response_type: "code",
    state,
  })

  if (app.oauth.scopes.length > 0) {
    params.set("scope", app.oauth.scopes.join(" "))
  }

  const authUrl = `${app.oauth.authUrl}?${params.toString()}`
  return c.json({ authUrl })
})
