import { z } from "zod"
import { createHmac, timingSafeEqual } from "crypto"
import { config } from "../config"

export function signState<T>(data: T): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url")
  const sig = createHmac("sha256", config().auth.secret).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifyState<T>(state: string, schema: z.ZodType<T>): T | null {
  const [payload, sig] = state.split(".")
  if (!payload || !sig) return null

  const expected = createHmac("sha256", config().auth.secret).update(payload).digest()
  const actual = Buffer.from(sig, "base64url")

  if (expected.length !== actual.length) return null
  if (!timingSafeEqual(expected, actual)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    const result = schema.safeParse(data)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
