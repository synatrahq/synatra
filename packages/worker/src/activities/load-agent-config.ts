import {
  principal,
  findAgentById,
  getAgentById,
  findAgentByRelease,
  findTriggerById,
  findPromptByRelease,
  findPromptById,
} from "@synatra/core"
import type { AgentRuntimeConfig, TriggerMode, PromptMode } from "@synatra/core/types"

export type VersionMode = "current" | "fixed"

export interface LoadAgentConfigInput {
  agentId: string
  agentReleaseId?: string
  agentVersionMode: VersionMode
  triggerId?: string
  organizationId: string
  runtimeConfigOverride?: AgentRuntimeConfig
}

export type PromptConfig =
  | { mode: "template"; template: string }
  | { mode: "script"; script: string; source: "trigger" | "prompt" }
  | null

export interface ResolvedSubagent {
  agentId: string
  alias: string
  description: string
  versionMode: "current" | "fixed"
  releaseId?: string
}

export interface LoadAgentConfigResult {
  agentId: string
  agentReleaseId: string
  agentConfig: AgentRuntimeConfig
  agentConfigHash: string
  promptConfig: PromptConfig
  resolvedSubagents: ResolvedSubagent[]
}

type TriggerData = {
  mode: TriggerMode
  template: string | null
  script: string | null
  promptId: string | null
  promptReleaseId: string | null
  promptVersionMode: string
}

async function resolvePromptConfig(trigger: TriggerData): Promise<PromptConfig> {
  if (trigger.mode === "template") {
    return trigger.template ? { mode: "template", template: trigger.template } : null
  }

  if (trigger.mode === "script") {
    if (!trigger.script) throw new Error("Trigger mode is script but script is null")
    return { mode: "script", script: trigger.script, source: "trigger" }
  }

  if (!trigger.promptId) return null

  if (trigger.promptVersionMode === "fixed") {
    if (!trigger.promptReleaseId) {
      throw new Error(`promptReleaseId is required when promptVersionMode is "fixed"`)
    }
    const release = await findPromptByRelease({
      promptId: trigger.promptId,
      releaseId: trigger.promptReleaseId,
    })
    if (!release) return null

    if (release.mode === "script") {
      if (!release.script) throw new Error("Prompt mode is script but script is null")
      return { mode: "script", script: release.script, source: "prompt" }
    }
    return { mode: "template", template: release.content }
  }

  const prompt = await findPromptById(trigger.promptId)
  if (!prompt || !prompt.mode) return null

  if (prompt.mode === "script") {
    if (!prompt.script) throw new Error("Prompt mode is script but script is null")
    return { mode: "script", script: prompt.script, source: "prompt" }
  }

  if (!prompt.content) return null
  return { mode: "template", template: prompt.content }
}

async function resolveSubagents(config: AgentRuntimeConfig): Promise<ResolvedSubagent[]> {
  if (!config.subagents || config.subagents.length === 0) return []

  const resolved: ResolvedSubagent[] = []
  for (const sub of config.subagents) {
    const agent = await findAgentById(sub.agentId)
    if (!agent) continue

    resolved.push({
      agentId: sub.agentId,
      alias: sub.alias ?? agent.slug,
      description: sub.description,
      versionMode: sub.versionMode,
      releaseId: sub.releaseId,
    })
  }
  return resolved
}

export async function loadAgentConfig(input: LoadAgentConfigInput): Promise<LoadAgentConfigResult> {
  const { agentId, agentReleaseId, agentVersionMode, triggerId, organizationId, runtimeConfigOverride } = input

  return principal.withSystem({ organizationId }, async () => {
    let promptConfig: PromptConfig = null
    if (triggerId) {
      const trigger = await findTriggerById(triggerId)
      if (trigger) {
        promptConfig = await resolvePromptConfig(trigger as TriggerData)
      }
    }

    if (agentVersionMode === "current") {
      const agent = await getAgentById(agentId)
      const releaseId = agent.currentReleaseId
      if (!releaseId) throw new Error(`Agent has no published release: ${agentId}`)
      if (!agent.configHash) throw new Error(`Agent config hash missing: ${agentId}`)

      const agentConfig = agent.runtimeConfig as AgentRuntimeConfig
      const configForSubagents = runtimeConfigOverride ?? agentConfig
      const resolvedSubagents = await resolveSubagents(configForSubagents)

      return {
        agentId: agent.id,
        agentReleaseId: releaseId,
        agentConfig,
        agentConfigHash: agent.configHash,
        promptConfig,
        resolvedSubagents,
      }
    }

    if (!agentReleaseId) throw new Error(`agentReleaseId is required when agentVersionMode is "fixed"`)

    const release = await findAgentByRelease({ agentId, releaseId: agentReleaseId })
    if (!release) throw new Error(`Release not found: ${agentReleaseId}`)

    const agentConfig = release.runtimeConfig as AgentRuntimeConfig
    const configForSubagents = runtimeConfigOverride ?? agentConfig
    const resolvedSubagents = await resolveSubagents(configForSubagents)

    return {
      agentId,
      agentReleaseId,
      agentConfig,
      agentConfigHash: release.configHash,
      promptConfig,
      resolvedSubagents,
    }
  })
}
