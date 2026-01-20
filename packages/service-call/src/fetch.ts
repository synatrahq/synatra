import type { ServiceConfig } from "./config"
import { createError, isProblemDetails, toErrorMessage, type ProblemDetails } from "@synatra/util/error"
import { signToken } from "./token"

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ProblemDetails }

const toProblemDetails = (status: number, message: string): ProblemDetails => {
  const name = status >= 400 && status < 500 ? "BadRequestError" : "InternalError"
  return createError(name, { message }).toProblemDetails({ status })
}

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
    const contentType = res.headers.get("content-type") ?? ""
    if (contentType.includes("application/json") || contentType.includes("application/problem+json")) {
      const payload = await res.json().catch(() => null)
      if (isProblemDetails(payload)) {
        return { ok: false, error: payload }
      }
      if (payload && typeof payload === "object" && "error" in payload && isProblemDetails(payload.error)) {
        return { ok: false, error: payload.error }
      }
      if (payload && typeof payload === "object" && "error" in payload) {
        const message = toErrorMessage((payload as Record<string, unknown>).error) || "Unknown error"
        return { ok: false, error: toProblemDetails(res.status, message) }
      }
      const message = toErrorMessage(payload) || "Unknown error"
      return { ok: false, error: toProblemDetails(res.status, message) }
    }

    const text = await res.text().catch(() => "Unknown error")
    return { ok: false, error: toProblemDetails(res.status, text) }
  }

  const data = (await res.json()) as T
  return { ok: true, data }
}
