import { principal, findAgentByRelease, listResources } from "@synatra/core"
import { isManagedResourceType, type AgentRuntimeConfig } from "@synatra/core/types"
import { executeCode } from "./executor-client"

export interface ExecuteFunctionInput {
  agentId: string
  agentReleaseId?: string
  toolName: string
  params: Record<string, unknown>
  organizationId: string
  environmentId: string
  maxTimeoutMs?: number
  runtimeConfig?: AgentRuntimeConfig
}

export type ExecuteFunctionResult =
  | { ok: true; result: unknown; logs: unknown[][]; durationMs: number }
  | { ok: false; error: string; durationMs: number }

export async function executeFunction(input: ExecuteFunctionInput): Promise<ExecuteFunctionResult> {
  const { agentId, agentReleaseId, toolName, params, organizationId, environmentId, maxTimeoutMs, runtimeConfig } =
    input
  const start = Date.now()

  return principal.withSystem({ organizationId }, async () => {
    let config: AgentRuntimeConfig

    if (runtimeConfig) {
      config = runtimeConfig
    } else if (agentReleaseId) {
      const release = await findAgentByRelease({ agentId, releaseId: agentReleaseId })
      if (!release) {
        return { ok: false, error: `Release not found: ${agentReleaseId}`, durationMs: Date.now() - start }
      }
      config = release.runtimeConfig as AgentRuntimeConfig
    } else {
      return {
        ok: false,
        error: "Either runtimeConfig or agentReleaseId must be provided",
        durationMs: Date.now() - start,
      }
    }
    const tool = config.tools.find((t) => t.name === toolName)
    if (!tool) {
      return { ok: false, error: `Tool not found: ${toolName}`, durationMs: Date.now() - start }
    }

    const allResources = await listResources()
    const resources = allResources.filter((r) => !isManagedResourceType(r.type))

    const rawTimeout = tool.timeoutMs
    const toolTimeoutMs =
      typeof rawTimeout === "number" && rawTimeout >= 100 && rawTimeout <= 60000 ? rawTimeout : 30000
    const timeout = maxTimeoutMs ? Math.min(toolTimeoutMs, maxTimeoutMs) : toolTimeoutMs

    const result = await executeCode(organizationId, {
      code: tool.code,
      params,
      context: {
        resources: resources.map((r) => ({ name: r.slug, resourceId: r.id, type: r.type })),
      },
      environmentId,
      timeout,
    })

    if (!result.ok) {
      return { ok: false, error: result.error, durationMs: Date.now() - start }
    }

    if (!result.data.success) {
      return { ok: false, error: result.data.error ?? "Code execution failed", durationMs: Date.now() - start }
    }

    return {
      ok: true,
      result: result.data.result,
      logs: result.data.logs,
      durationMs: Date.now() - start,
    }
  })
}
