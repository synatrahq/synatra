import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

let encryptionKey: Buffer | null = null

export function initEncryption(keyBase64: string): void {
  const key = Buffer.from(keyBase64, "base64")
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded from base64")
  }
  encryptionKey = key
}

function getKey(): Buffer {
  if (!encryptionKey) {
    throw new Error("Encryption not initialized. Call initEncryption() first.")
  }
  return encryptionKey
}

export type EncryptedValue = {
  ciphertext: string
  iv: string
  tag: string
}

export function encrypt(plaintext: string): EncryptedValue {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "base64")
  encrypted += cipher.final("base64")

  const tag = cipher.getAuthTag()

  return {
    ciphertext: encrypted,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  }
}

export function decrypt(encrypted: EncryptedValue): string {
  const key = getKey()
  const iv = Buffer.from(encrypted.iv, "base64")
  const tag = Buffer.from(encrypted.tag, "base64")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted.ciphertext, "base64", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

export function isEncryptedValue(value: unknown): value is EncryptedValue {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.ciphertext === "string" && typeof v.iv === "string" && typeof v.tag === "string"
}
