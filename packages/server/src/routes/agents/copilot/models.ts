import { Hono } from "hono"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { listResourcesWithConfigs } from "@synatra/core"
import type { StoredSynatraAiConfig } from "@synatra/core/types"
import { decrypt, isEncryptedValue } from "@synatra/util/crypto"
import { requireAuth, requireOrganization } from "../../../middleware/principal"

type Provider = "anthropic" | "openai" | "google"

type CopilotModelDef = {
  id: string
  apiModelId: string
  provider: Provider
  name: string
  supportsThinking: boolean
}

export const COPILOT_MODELS: CopilotModelDef[] = [
  {
    id: "claude-sonnet-4-5",
    apiModelId: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    name: "Claude Sonnet 4.5",
    supportsThinking: true,
  },
  {
    id: "claude-opus-4-5",
    apiModelId: "claude-opus-4-5-20251101",
    provider: "anthropic",
    name: "Claude Opus 4.5",
    supportsThinking: true,
  },
  {
    id: "claude-haiku-4-5",
    apiModelId: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    name: "Claude Haiku 4.5",
    supportsThinking: true,
  },
  {
    id: "claude-sonnet-4",
    apiModelId: "claude-sonnet-4-20250514",
    provider: "anthropic",
    name: "Claude Sonnet 4",
    supportsThinking: true,
  },
  {
    id: "claude-opus-4",
    apiModelId: "claude-opus-4-20250514",
    provider: "anthropic",
    name: "Claude Opus 4",
    supportsThinking: true,
  },
  { id: "gpt-5.2", apiModelId: "gpt-5.2-2025-12-11", provider: "openai", name: "GPT-5.2", supportsThinking: false },
  {
    id: "gpt-5.2-pro",
    apiModelId: "gpt-5.2-pro-2025-12-11",
    provider: "openai",
    name: "GPT-5.2 Pro",
    supportsThinking: false,
  },
  { id: "gpt-4.1", apiModelId: "gpt-4.1-2025-04-14", provider: "openai", name: "GPT-4.1", supportsThinking: false },
  {
    id: "gpt-4.1-mini",
    apiModelId: "gpt-4.1-mini-2025-04-14",
    provider: "openai",
    name: "GPT-4.1 mini",
    supportsThinking: false,
  },
  {
    id: "gpt-4.1-nano",
    apiModelId: "gpt-4.1-nano-2025-04-14",
    provider: "openai",
    name: "GPT-4.1 nano",
    supportsThinking: false,
  },
  { id: "gpt-4o", apiModelId: "gpt-4o", provider: "openai", name: "GPT-4o", supportsThinking: false },
  { id: "gpt-4o-mini", apiModelId: "gpt-4o-mini", provider: "openai", name: "GPT-4o mini", supportsThinking: false },
  {
    id: "gemini-3-flash",
    apiModelId: "gemini-3-flash-preview",
    provider: "google",
    name: "Gemini 3 Flash",
    supportsThinking: true,
  },
  {
    id: "gemini-3-pro",
    apiModelId: "gemini-3-pro-preview",
    provider: "google",
    name: "Gemini 3 Pro",
    supportsThinking: true,
  },
  {
    id: "gemini-2.5-flash",
    apiModelId: "gemini-2.5-flash",
    provider: "google",
    name: "Gemini 2.5 Flash",
    supportsThinking: true,
  },
  {
    id: "gemini-2.5-flash-lite",
    apiModelId: "gemini-2.5-flash-lite",
    provider: "google",
    name: "Gemini 2.5 Flash Lite",
    supportsThinking: false,
  },
]

const DEFAULT_MODELS: Record<Provider, CopilotModelDef> = {
  anthropic: COPILOT_MODELS.find((m) => m.id === "claude-sonnet-4-5")!,
  openai: COPILOT_MODELS.find((m) => m.id === "gpt-5.2")!,
  google: COPILOT_MODELS.find((m) => m.id === "gemini-3-flash")!,
}

type ModelConfig = {
  model:
    | ReturnType<ReturnType<typeof createAnthropic>>
    | ReturnType<ReturnType<typeof createOpenAI>>
    | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
  supportsThinking: boolean
}

type ProviderConfig = { apiKey: string; baseUrl?: string }

async function getProductionConfig(): Promise<Record<Provider, ProviderConfig | null>> {
  const resources = await listResourcesWithConfigs()
  const synatraAi = resources.find((r) => r.type === "synatra_ai" && r.managed)
  const env = synatraAi?.configs.find((c) => c.environmentSlug === "production")
  if (!env) return { anthropic: null, openai: null, google: null }

  const cfg = env.config as StoredSynatraAiConfig
  const resolve = (p: StoredSynatraAiConfig["openai"]): ProviderConfig | null => {
    if (!p?.apiKey || !isEncryptedValue(p.apiKey) || !(p.enabled ?? true)) return null
    return { apiKey: decrypt(p.apiKey), baseUrl: p.baseUrl ?? undefined }
  }
  return { anthropic: resolve(cfg.anthropic), openai: resolve(cfg.openai), google: resolve(cfg.google) }
}

function createProviderModel(def: CopilotModelDef, cfg: ProviderConfig): ModelConfig {
  const providers = {
    anthropic: () =>
      createAnthropic({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseUrl,
        headers: { "anthropic-beta": "interleaved-thinking-2025-05-14" },
      })(def.apiModelId),
    openai: () => createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })(def.apiModelId),
    google: () => createGoogleGenerativeAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })(def.apiModelId),
  }
  return { model: providers[def.provider](), supportsThinking: def.supportsThinking }
}

export async function getModel(modelId?: string): Promise<ModelConfig> {
  const cfgs = await getProductionConfig()
  const def = modelId ? COPILOT_MODELS.find((m) => m.id === modelId) : null

  if (def) {
    const cfg = cfgs[def.provider]
    if (!cfg) throw new Error(`${def.provider} is not configured for ${def.name}`)
    return createProviderModel(def, cfg)
  }

  for (const p of ["anthropic", "openai", "google"] as const) {
    if (cfgs[p]) return createProviderModel(DEFAULT_MODELS[p], cfgs[p])
  }

  throw new Error("No LLM provider configured. Configure API keys in the Synatra AI resource.")
}

export async function getAvailableModelsForProduction(): Promise<{ id: string; name: string }[]> {
  const cfgs = await getProductionConfig()
  const enabled = (["openai", "anthropic", "google"] as const).filter((p) => cfgs[p])
  return COPILOT_MODELS.filter((m) => enabled.includes(m.provider)).map((m) => ({ id: m.id, name: m.name }))
}

export const models = new Hono().get("/:id/copilot/models", requireAuth, requireOrganization, async (c) => {
  const prodModels = await getAvailableModelsForProduction()
  return c.json({ models: prodModels })
})
