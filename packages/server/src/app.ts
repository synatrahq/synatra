import { Hono } from "hono"
import { cors } from "hono/cors"

import { initEncryption } from "@synatra/util/crypto"
import { auth } from "./auth"
import { config } from "./config"
import { principalMiddleware, requireAuth, requireOrganization, requirePermission } from "./middleware/principal"
import { stagingAuth, noIndex } from "./middleware/staging-auth"
import { agents } from "./routes/agents"
import { channels } from "./routes/channels"
import { connectors } from "./routes/connectors"
import { environments } from "./routes/environments"
import { resources } from "./routes/resources"
import { triggers } from "./routes/triggers"
import { prompts } from "./routes/prompts"
import { threads } from "./routes/threads"
import { user } from "./routes/user"
import { organizations } from "./routes/organizations"
import { webhook } from "./routes/webhook"
import { appWebhook } from "./routes/app-webhook"
import { triggerRun } from "./routes/trigger-run"
import { appAccounts, oauthCallback, githubCallback } from "./routes/app-accounts"
import { usage } from "./routes/usage"
import { subscriptions, subscriptionsWebhook } from "./routes/subscriptions"
import { setupStatic } from "./static"
import { fromUnknown, isAppError } from "@synatra/util/error"

initEncryption(config().encryption.key)

export const app = new Hono()
  .onError((err, c) => {
    if (!isAppError(err)) {
      console.error("Unhandled error:", err)
    }
    const appError = fromUnknown(err)
    const problem = appError.toProblemDetails()
    return c.json(problem, problem.status as 400)
  })
  .use("*", stagingAuth)
  .use("*", noIndex)
  .use(
    "/api/*",
    cors({
      origin: (origin) => {
        if (!origin) return ""
        return config().app.origins.includes(origin) ? origin : ""
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .get("/api/health", (c) => c.json({ ok: true }))
  .route("/api/webhook", webhook)
  .route("/api/app", appWebhook)
  .route("/api/triggers", triggerRun)
  .route("/api/app-accounts/oauth", oauthCallback)
  .route("/api/app-accounts/github", githubCallback)
  .route("/api/subscriptions", subscriptionsWebhook)
  .use("/api/user/*", principalMiddleware, requireAuth)
  .use("/api/app-accounts/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/threads/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/agents/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/connectors/*", principalMiddleware, requireAuth, requireOrganization)
  .use(
    "/api/resources/*",
    principalMiddleware,
    requireAuth,
    requireOrganization,
    requirePermission("resource", "create"),
  )
  .use("/api/triggers/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/prompts/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/channels/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/environments/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/usage/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/subscriptions/*", principalMiddleware, requireAuth, requireOrganization)
  .use("/api/organizations/*", principalMiddleware, requireAuth, requireOrganization)
  .route("/api/agents", agents)
  .route("/api/channels", channels)
  .route("/api/connectors", connectors)
  .route("/api/environments", environments)
  .route("/api/resources", resources)
  .route("/api/triggers", triggers)
  .route("/api/prompts", prompts)
  .route("/api/threads", threads)
  .route("/api/user", user)
  .route("/api/usage", usage)
  .route("/api/subscriptions", subscriptions)
  .route("/api/organizations", organizations)
  .route("/api/app-accounts", appAccounts)

setupStatic(app)

export type AppType = typeof app
