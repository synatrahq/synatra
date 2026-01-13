import type { ServiceConfig } from "./config"
import { signToken } from "./token"

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function serviceFetch<T>(
  config: ServiceConfig,
  url: string,
  body: unknown,
  organizationId?: string,
): Promise<ServiceResult<T>> {
  const token = await signToken(config.serviceSecret, config.serviceName, organizationId)

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error")
    return { ok: false, error: `${res.status}: ${text}` }
  }

  const data = (await res.json()) as T
  return { ok: true, data }
}
