import { principal, listResources } from "@synatra/core"
import { isManagedResourceType, type ScriptResult } from "@synatra/core/types"
import { executeCode } from "./executor-client"
import { toErrorMessage } from "@synatra/util/error"

export interface ExecuteScriptInput {
  script: string
  payload: Record<string, unknown>
  paramAlias: "payload" | "input"
  organizationId: string
  environmentId: string
  timeout?: number
}

export type ExecuteScriptResult =
  | { ok: true; result: ScriptResult; logs: unknown[][]; durationMs: number }
  | { ok: false; error: string; durationMs: number }

function validateScriptResult(result: unknown): ScriptResult {
  if (!result || typeof result !== "object") {
    throw new Error("Script must return an object with action field")
  }

  const obj = result as Record<string, unknown>
  if (obj.action === "skip") {
    return { action: "skip", reason: typeof obj.reason === "string" ? obj.reason : undefined }
  }

  if (obj.action === "run") {
    if (typeof obj.prompt !== "string") {
      throw new Error("Script returned action='run' but prompt is not a string")
    }
    return { action: "run", prompt: obj.prompt }
  }

  throw new Error(`Script returned invalid action: ${obj.action}`)
}

export async function executeScript(input: ExecuteScriptInput): Promise<ExecuteScriptResult> {
  const { script, payload, paramAlias, organizationId, environmentId, timeout = 30000 } = input
  const start = Date.now()

  return principal.withSystem({ organizationId }, async () => {
    const allResources = await listResources()
    const resources = allResources.filter((r) => !isManagedResourceType(r.type))

    const result = await executeCode(organizationId, {
      code: script,
      params: payload,
      paramAlias,
      context: {
        resources: resources.map((r) => ({ name: r.slug, resourceId: r.id, type: r.type })),
      },
      environmentId,
      timeout,
    })

    if (!result.ok) {
      return { ok: false, error: toErrorMessage(result.error), durationMs: Date.now() - start }
    }

    if (!result.data.success) {
      return { ok: false, error: result.data.error ?? "Script execution failed", durationMs: Date.now() - start }
    }

    try {
      const scriptResult = validateScriptResult(result.data.result)
      return {
        ok: true,
        result: scriptResult,
        logs: result.data.logs,
        durationMs: Date.now() - start,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid script result"
      return { ok: false, error: msg, durationMs: Date.now() - start }
    }
  })
}
