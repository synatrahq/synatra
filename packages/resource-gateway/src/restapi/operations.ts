import { z } from "zod"
import { validateExternalUrl } from "@synatra/util/url"
import { applyAuth } from "./auth"
import type { RestApiResource } from "../types"
import type { KeyValuePair } from "@synatra/core/types"

export const restapiOperation = z.object({
  type: z.literal("restapi"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  queryParams: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
})

export type RestApiOperation = z.infer<typeof restapiOperation>

interface OperationResult {
  data: unknown
}

const RESTAPI_TIMEOUT_MS = 30000

const toRecord = (pairs: KeyValuePair[]): Record<string, string> =>
  Object.fromEntries(pairs.map((p) => [p.key, p.value]))

export async function executeRestApiOperation(
  resource: RestApiResource,
  operation: RestApiOperation,
): Promise<OperationResult> {
  const { config } = resource
  const { baseUrl, auth, headers: configHeaders, queryParams: configQueryParams } = config

  const authResult = applyAuth(auth)

  const url = new URL(operation.path, baseUrl)
  await validateExternalUrl(url.toString())

  const allQueryParams = {
    ...toRecord(configQueryParams ?? []),
    ...authResult.queryParams,
    ...(operation.queryParams ?? {}),
  }
  for (const [key, value] of Object.entries(allQueryParams)) {
    url.searchParams.set(key, value)
  }

  const allHeaders: Record<string, string> = {
    ...toRecord(configHeaders ?? []),
    ...authResult.headers,
    ...(operation.headers ?? {}),
  }

  if (operation.body && !allHeaders["Content-Type"]) {
    allHeaders["Content-Type"] = "application/json"
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RESTAPI_TIMEOUT_MS)

  const res = await fetch(url.toString(), {
    method: operation.method,
    headers: allHeaders,
    body: operation.body ? JSON.stringify(operation.body) : undefined,
    signal: controller.signal,
    redirect: "error",
  }).finally(() => clearTimeout(timeoutId))

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`REST API error: ${res.status} ${error}`)
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return { data: null }
  }

  const contentType = res.headers.get("content-type")
  if (contentType?.includes("application/json")) {
    return { data: await res.json() }
  }

  return { data: await res.text() }
}
