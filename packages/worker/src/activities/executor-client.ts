import { loadConfig, createCodeExecutor, type ExecuteInput, type ExecuteResult } from "@synatra/service-call"

export type { ExecuteInput, ExecuteResult }

export type ExecuteCodeResult = { ok: true; data: ExecuteResult } | { ok: false; error: string }

const config = loadConfig("worker")
const executor = createCodeExecutor(config)

export async function executeCode(organizationId: string, input: ExecuteInput): Promise<ExecuteCodeResult> {
  const result = await executor.execute(organizationId, input)

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Code execution failed" }
  }

  return { ok: true, data: result.data }
}
