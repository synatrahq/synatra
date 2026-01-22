const INTERCOM_TIMEOUT_MS = 60000
const INTERCOM_API_VERSION = "2.14"

export async function intercomRequest(
  accessToken: string,
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), INTERCOM_TIMEOUT_MS)

  const res = await fetch(`https://api.intercom.io${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Intercom-Version": INTERCOM_API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId))

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Intercom API error: ${res.status} ${error}`)
  }

  if (res.status === 204) {
    return null
  }

  return res.json()
}
