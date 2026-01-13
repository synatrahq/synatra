import { principal, getResourceProviderConfig } from "@synatra/core"
import type { LlmProvider } from "@synatra/core/types"
import type { ResolvedLlmConfig } from "./call-llm"

export interface ResolveLlmConfigInput {
  organizationId: string
  environmentId: string
  provider: LlmProvider
}

export interface ResolveLlmConfigResult {
  config: ResolvedLlmConfig | null
}

export async function resolveLlmConfig(input: ResolveLlmConfigInput): Promise<ResolveLlmConfigResult> {
  return principal.withSystem({ organizationId: input.organizationId }, async () => {
    const config = await getResourceProviderConfig({
      environmentId: input.environmentId,
      provider: input.provider,
    })
    if (!config) return { config: null }
    return { config }
  })
}
