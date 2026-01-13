import type { RestApiAuth } from "@synatra/core/types"

export type AuthHeaders = Record<string, string>
export type AuthQueryParams = Record<string, string>

export interface AuthResult {
  headers: AuthHeaders
  queryParams: AuthQueryParams
}

export function applyAuth(auth: RestApiAuth): AuthResult {
  switch (auth.type) {
    case "none":
      return { headers: {}, queryParams: {} }
    case "api_key":
      return applyApiKeyAuth(auth)
    case "bearer":
      return applyBearerAuth(auth)
    case "basic":
      return applyBasicAuth(auth)
  }
}

function applyApiKeyAuth(auth: Extract<RestApiAuth, { type: "api_key" }>): AuthResult {
  if (auth.location === "header") {
    return { headers: { [auth.name]: auth.key }, queryParams: {} }
  }
  return { headers: {}, queryParams: { [auth.name]: auth.key } }
}

function applyBearerAuth(auth: Extract<RestApiAuth, { type: "bearer" }>): AuthResult {
  return {
    headers: { Authorization: `Bearer ${auth.token}` },
    queryParams: {},
  }
}

function applyBasicAuth(auth: Extract<RestApiAuth, { type: "basic" }>): AuthResult {
  const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString("base64")
  return {
    headers: { Authorization: `Basic ${encoded}` },
    queryParams: {},
  }
}
