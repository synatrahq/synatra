import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { requirePermission } from "../../middleware/principal"

const providerSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().nullable().optional(),
})

const schema = z.object({
  providers: z.array(providerSchema).min(1),
})

const DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
}

type ValidationResult = { valid: true } | { valid: false; error: string }

async function parseError(res: Response, authErrorCodes: number[]): Promise<ValidationResult> {
  if (authErrorCodes.includes(res.status)) return { valid: false, error: "Invalid API key" }
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  return { valid: false, error: body?.error?.message || `Request failed with status ${res.status}` }
}

async function validateOpenAI(apiKey: string, baseUrl: string): Promise<ValidationResult> {
  const res = await fetch(`${baseUrl}/v1/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (res.ok) return { valid: true }
  return parseError(res, [401])
}

async function validateAnthropic(apiKey: string, baseUrl: string): Promise<ValidationResult> {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  })
  if (res.ok) return { valid: true }
  return parseError(res, [401])
}

async function validateGoogle(apiKey: string, baseUrl: string): Promise<ValidationResult> {
  const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`, { method: "GET" })
  if (res.ok) return { valid: true }
  return parseError(res, [400, 401])
}

type Provider = "openai" | "anthropic" | "google"

const validators: Record<Provider, (apiKey: string, baseUrl: string) => Promise<ValidationResult>> = {
  openai: validateOpenAI,
  anthropic: validateAnthropic,
  google: validateGoogle,
}

export const validateLlmKey = new Hono().post(
  "/validate-llm-keys",
  requirePermission("resource", "create"),
  zValidator("json", schema),
  async (c) => {
    const { providers } = c.req.valid("json")

    const results = await Promise.all(
      providers.map(async ({ provider, apiKey, baseUrl }) => {
        const url = baseUrl || DEFAULT_BASE_URLS[provider]
        const result = await validators[provider](apiKey, url)
        return { provider, apiKey, ...result }
      }),
    )

    return c.json(results)
  },
)
