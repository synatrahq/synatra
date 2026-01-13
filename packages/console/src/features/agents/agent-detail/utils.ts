import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import type { AgentRuntimeConfig } from "@synatra/core/types"

export function parseAndValidateYaml(
  yaml: string,
): { config: AgentRuntimeConfig; error: null } | { config: null; error: string } {
  try {
    const parsed = parseYaml(yaml)
    if (!parsed || typeof parsed !== "object") {
      return { config: null, error: "Invalid YAML: must be an object" }
    }
    if (!parsed.model || typeof parsed.model !== "object") {
      return { config: null, error: "model configuration is required" }
    }
    if (!parsed.model.provider) {
      return { config: null, error: "model.provider is required" }
    }
    if (!parsed.model.model) {
      return { config: null, error: "model.model is required" }
    }

    const config: AgentRuntimeConfig = {
      model: {
        provider: parsed.model.provider,
        model: parsed.model.model,
        temperature: parsed.model.temperature ?? 0.7,
        topP: parsed.model.topP,
      },
      systemPrompt: parsed.systemPrompt ?? "",
      tools: parsed.tools ?? [],
      $defs: parsed.$defs,
      maxIterations: parsed.maxIterations,
      maxToolCallsPerIteration: parsed.maxToolCallsPerIteration,
      maxActiveTimeMs: parsed.maxActiveTimeMs,
    }

    return { config, error: null }
  } catch (e) {
    return { config: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export function configToYaml(config: AgentRuntimeConfig): string {
  const obj: Record<string, unknown> = {
    model: config.model,
    systemPrompt: config.systemPrompt,
    tools: config.tools,
  }
  if (config.$defs && Object.keys(config.$defs).length > 0) obj.$defs = config.$defs
  if (config.maxIterations != null) obj.maxIterations = config.maxIterations
  if (config.maxToolCallsPerIteration != null) obj.maxToolCallsPerIteration = config.maxToolCallsPerIteration
  if (config.maxActiveTimeMs != null) obj.maxActiveTimeMs = config.maxActiveTimeMs
  return stringifyYaml(obj, { lineWidth: 0 })
}

export function stableId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}
