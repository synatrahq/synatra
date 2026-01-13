import { SignJWT, jwtVerify } from "jose"
import type { ServiceName } from "./config"

const ALG = "HS256"
const EXPIRY = "30s"

export type TokenPayload = {
  svc: ServiceName
  org?: string
}

export async function signToken(secret: string, service: ServiceName, organizationId?: string): Promise<string> {
  const key = new TextEncoder().encode(secret)
  const payload: Record<string, string> = { svc: service }
  if (organizationId) payload.org = organizationId

  return new SignJWT(payload).setProtectedHeader({ alg: ALG }).setIssuedAt().setExpirationTime(EXPIRY).sign(key)
}

export async function verifyToken(secret: string, token: string): Promise<TokenPayload | null> {
  const key = new TextEncoder().encode(secret)
  try {
    const { payload } = await jwtVerify(token, key)
    return payload as TokenPayload
  } catch {
    return null
  }
}
