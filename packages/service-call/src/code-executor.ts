import type { ServiceConfig } from "./config"
import { serviceFetch, type ServiceResult } from "./fetch"

export type ResourceMapping = {
  name: string
  resourceId: string
  type: string
}

export type ExecuteContext = {
  resources?: ResourceMapping[]
}

export type ExecuteInput = {
  code: string
  params: Record<string, unknown>
  paramAlias?: "payload" | "input"
  context: ExecuteContext
  environmentId: string
  timeout?: number
}

export type ExecuteResult = {
  success: boolean
  result?: unknown
  error?: string
  logs: unknown[][]
  duration: number
}

export type CodeExecutor = {
  execute: (organizationId: string, input: ExecuteInput) => Promise<ServiceResult<ExecuteResult>>
}

export function createCodeExecutor(config: ServiceConfig): CodeExecutor {
  const base = config.codeExecutorUrl

  return {
    async execute(organizationId, input) {
      return serviceFetch(
        config,
        `${base}/execute`,
        {
          code: input.code,
          params: input.params,
          paramAlias: input.paramAlias,
          context: input.context,
          environmentId: input.environmentId,
          timeout: input.timeout ?? 30000,
        },
        organizationId,
      )
    },
  }
}
