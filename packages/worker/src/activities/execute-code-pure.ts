import { executeCode } from "./executor-client"
import { toErrorMessage } from "@synatra/util/error"

export interface ExecuteCodePureInput {
  organizationId: string
  environmentId: string
  code: string
  timeout?: number
}

export interface ExecuteCodePureResult {
  success: boolean
  result?: unknown
  error?: string
  logs: unknown[][]
  duration: number
}

const DEFAULT_TIMEOUT = 10000
const MAX_TIMEOUT = 30000
const MIN_TIMEOUT = 100

export async function executeCodePure(input: ExecuteCodePureInput): Promise<ExecuteCodePureResult> {
  const { organizationId, environmentId, code, timeout: rawTimeout } = input
  const start = Date.now()
  const timeout = Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, rawTimeout ?? DEFAULT_TIMEOUT))

  const result = await executeCode(organizationId, {
    code,
    params: {},
    context: { resources: [] },
    environmentId,
    timeout,
  })

  if (!result.ok) {
    return {
      success: false,
      error: toErrorMessage(result.error),
      logs: [],
      duration: Date.now() - start,
    }
  }

  if (!result.data.success) {
    return {
      success: false,
      error: result.data.error ?? "Code execution failed",
      logs: result.data.logs,
      duration: Date.now() - start,
    }
  }

  return {
    success: true,
    result: result.data.result,
    logs: result.data.logs,
    duration: Date.now() - start,
  }
}
