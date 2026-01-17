import type { RadioOption } from "../../../../ui"
import type { SelectOption } from "../../../../ui"
import type { LlmProvider } from "@synatra/core/types"
import type { RestApiEditorConfig } from "../constants"
import openaiLight from "../../../../assets/images/openai_light.svg"
import openaiDark from "../../../../assets/images/openai_dark.svg"
import anthropicLight from "../../../../assets/images/anthropic_light.svg"
import anthropicDark from "../../../../assets/images/anthropic_dark.svg"
import googleLogo from "../../../../assets/images/google.svg"

export const SSL_OPTIONS: RadioOption[] = [
  { value: "full", label: "Full verification" },
  { value: "verify_ca", label: "Verify CA certificate" },
  { value: "skip_ca", label: "Skip CA verification" },
]

export const AUTH_TYPE_OPTIONS: SelectOption<RestApiEditorConfig["authType"]>[] = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API Key" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
]

export const API_KEY_LOCATION_OPTIONS: RadioOption[] = [
  { value: "header", label: "Header" },
  { value: "query", label: "Query Parameter" },
]

export const LLM_PROVIDERS: {
  id: LlmProvider
  name: string
  recommended?: boolean
  placeholder: string
  helpUrl: string
}[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    recommended: true,
    placeholder: "sk-ant-api03-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    name: "Google AI",
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/app/apikey",
  },
]

export const PROVIDER_ICONS: Record<LlmProvider, { light: string; dark: string; size: string }> = {
  openai: { light: openaiLight, dark: openaiDark, size: "h-5 w-5" },
  anthropic: { light: anthropicLight, dark: anthropicDark, size: "h-3.5 w-3.5" },
  google: { light: googleLogo, dark: googleLogo, size: "h-3.5 w-3.5" },
}

export function validatePemCertificate(content: string): string | null {
  if (!content.includes("-----BEGIN CERTIFICATE-----")) {
    return "Invalid format. Must be a PEM certificate starting with -----BEGIN CERTIFICATE-----"
  }
  if (!content.includes("-----END CERTIFICATE-----")) {
    return "Invalid format. Must end with -----END CERTIFICATE-----"
  }
  return null
}

export function validatePemPrivateKey(content: string): string | null {
  const pairs = [
    { begin: "-----BEGIN PRIVATE KEY-----", end: "-----END PRIVATE KEY-----" },
    { begin: "-----BEGIN RSA PRIVATE KEY-----", end: "-----END RSA PRIVATE KEY-----" },
    { begin: "-----BEGIN EC PRIVATE KEY-----", end: "-----END EC PRIVATE KEY-----" },
  ]
  const match = pairs.find((p) => content.includes(p.begin))
  if (!match) return "Invalid format. Must be a PEM private key"
  if (!content.includes(match.end)) return "File appears truncated"
  return null
}
