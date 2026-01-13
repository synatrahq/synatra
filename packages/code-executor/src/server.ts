import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { createError } from "@synatra/util/error"
import { serviceAuth } from "@synatra/service-call"
import { UserConfigurableResourceType } from "@synatra/core/types"
import * as pool from "./pool"
import { QueueFullError } from "./pool"
import { config } from "./config"

const executorConfig = config()

const app = new Hono()

app.use("*", serviceAuth(executorConfig.serviceSecret))

app.get("/health", (c) => {
  return c.json({ status: "ok" })
})

const resourceSchema = z.object({
  name: z.string(),
  resourceId: z.string(),
  type: z.enum(UserConfigurableResourceType),
})

const executeSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
  paramAlias: z.enum(["payload", "input"]).optional(),
  context: z.object({
    resources: z.array(resourceSchema).default([]),
  }),
  environmentId: z.string(),
  timeout: z.number().min(100).max(60000).default(30000),
})

app.post("/execute", zValidator("json", executeSchema), async (c) => {
  const { code, params, paramAlias, context, environmentId, timeout } = c.req.valid("json")
  const organizationId = c.get("organizationId")
  if (!organizationId) throw createError("BadRequestError", { message: "Missing organizationId in token" })

  try {
    const result = await pool.execute({
      organizationId,
      code,
      params,
      paramAlias,
      context,
      environmentId,
      timeout,
    })

    return c.json({
      success: true,
      result: result.value,
      logs: result.logs,
      duration: result.duration,
    })
  } catch (error) {
    if (error instanceof QueueFullError) {
      return c.text("Execution queue is full", 503, { "Retry-After": "5" })
    }
    const message = error instanceof Error ? error.message : String(error)
    return c.json({
      success: false,
      error: message,
      logs: [],
      duration: 0,
    })
  }
})

export { app }
