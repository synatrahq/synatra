import { isEncryptedValue } from "@synatra/util/crypto"
import type { ResourceType, StoredResourceConfig, APIResourceConfig } from "@synatra/core/types"

export function toAPIResourceConfig(type: ResourceType, stored: StoredResourceConfig): APIResourceConfig {
  if (type === "postgres" || type === "mysql") {
    const s = stored as Record<string, unknown>
    return {
      host: s.host as string,
      port: s.port as number,
      database: s.database as string,
      user: s.user as string,
      hasPassword: isEncryptedValue(s.password),
      ssl: s.ssl as boolean,
      sslVerification: s.sslVerification as "full" | "verify_ca" | "skip_ca",
      hasCaCertificate: isEncryptedValue(s.caCertificate),
      caCertificateFilename: (s.caCertificateFilename as string | null) ?? null,
      hasClientCertificate: isEncryptedValue(s.clientCertificate),
      clientCertificateFilename: (s.clientCertificateFilename as string | null) ?? null,
      hasClientKey: isEncryptedValue(s.clientKey),
      clientKeyFilename: (s.clientKeyFilename as string | null) ?? null,
    }
  }

  if (type === "github") {
    const s = stored as Record<string, unknown>
    return { appAccountId: s.appAccountId as string }
  }

  if (type === "intercom") {
    const s = stored as Record<string, unknown>
    return { appAccountId: s.appAccountId as string }
  }

  if (type === "stripe") {
    const s = stored as Record<string, unknown>
    return {
      hasApiKey: isEncryptedValue(s.apiKey),
      apiVersion: s.apiVersion as string,
    }
  }

  if (type === "synatra_ai") {
    const s = stored as {
      openai?: { apiKey?: string; baseUrl?: string | null; enabled?: boolean } | null
      anthropic?: { apiKey?: string; baseUrl?: string | null; enabled?: boolean } | null
      google?: { apiKey?: string; baseUrl?: string | null; enabled?: boolean } | null
    }
    const toProviderConfig = (p: { apiKey?: string; baseUrl?: string | null; enabled?: boolean } | null | undefined) =>
      p ? { hasApiKey: isEncryptedValue(p.apiKey), baseUrl: p.baseUrl ?? null, enabled: p.enabled ?? true } : null
    return {
      openai: toProviderConfig(s.openai),
      anthropic: toProviderConfig(s.anthropic),
      google: toProviderConfig(s.google),
    }
  }

  const s = stored as Record<string, unknown>
  return {
    baseUrl: (s.baseUrl as string) ?? "",
    authType: (s.authType as "none" | "api_key" | "bearer" | "basic") ?? "none",
    hasAuthConfig: isEncryptedValue(s.authConfig),
    authLocation: s.authLocation as "header" | "query" | undefined,
    authName: s.authName as string | undefined,
    headers: (s.headers as Record<string, string>) ?? {},
    queryParams: (s.queryParams as Record<string, string>) ?? {},
  }
}
