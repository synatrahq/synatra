import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { principal, getAgentById, getEnvironmentById, listResources } from "@synatra/core"
import { isManagedResourceType, AgentRuntimeConfigSchema } from "@synatra/core/types"
import { loadConfig, createCodeExecutor } from "@synatra/service-call"

const schema = z.object({
  toolName: z.string(),
  params: z.record(z.string(), z.unknown()),
  environmentId: z.string(),
  runtimeConfig: AgentRuntimeConfigSchema,
})

export const executeTool = new Hono().post("/:id/playground/execute-tool", zValidator("json", schema), async (c) => {
  const agentId = c.req.param("id")
  const { toolName, params, environmentId, runtimeConfig } = c.req.valid("json")
  const organizationId = principal.orgId()
  const start = Date.now()

  await getAgentById(agentId)
  await getEnvironmentById(environmentId)

  const tool = runtimeConfig.tools.find((t) => t.name === toolName)
  if (!tool) {
    return c.json({
      ok: false,
      error: `Tool not found: ${toolName}`,
      logs: [],
      durationMs: Date.now() - start,
    })
  }

  const allResources = await listResources()
  const resources = allResources.filter((r) => !isManagedResourceType(r.type))
  const config = loadConfig("server")
  const executor = createCodeExecutor(config)

  const rawTimeout = tool.timeoutMs
  const timeout = typeof rawTimeout === "number" && rawTimeout >= 100 && rawTimeout <= 60000 ? rawTimeout : 30000

  const result = await executor.execute(organizationId, {
    code: tool.code,
    params,
    context: {
      resources: resources.map((r) => ({ name: r.slug, resourceId: r.id, type: r.type })),
    },
    environmentId,
    timeout,
  })

  if (!result.ok) {
    return c.json({
      ok: false,
      error: result.error,
      logs: [],
      durationMs: Date.now() - start,
    })
  }

  if (!result.data.success) {
    return c.json({
      ok: false,
      error: result.data.error ?? "Code execution failed",
      logs: result.data.logs,
      durationMs: Date.now() - start,
    })
  }

  return c.json({
    ok: true,
    result: result.data.result,
    logs: result.data.logs,
    durationMs: Date.now() - start,
  })
})
