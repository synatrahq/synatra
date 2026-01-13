import { describe, test, expect, beforeAll, beforeEach } from "vitest"
import { decrypt, encrypt, initEncryption, isEncryptedValue } from "../crypto"

describe("Crypto", () => {
  const validKey = Buffer.from("a".repeat(32)).toString("base64")
  const invalidKeyTooShort = Buffer.from("short").toString("base64")
  const invalidKeyTooLong = Buffer.from("a".repeat(64)).toString("base64")

  describe("initEncryption", () => {
    test("throws error when key is less than 32 bytes", () => {
      expect(() => initEncryption(invalidKeyTooShort)).toThrow(
        "ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded from base64",
      )
    })

    test("throws error when key is more than 32 bytes", () => {
      expect(() => initEncryption(invalidKeyTooLong)).toThrow(
        "ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded from base64",
      )
    })

    test("succeeds with valid 32-byte key", () => {
      expect(() => initEncryption(validKey)).not.toThrow()
    })

    test("throws error for invalid base64", () => {
      expect(() => initEncryption("not-valid-base64!!!")).toThrow()
    })
  })

  describe("encrypt/decrypt", () => {
    beforeAll(() => {
      initEncryption(validKey)
    })

    test("roundtrip: encrypts and decrypts back to original", () => {
      const plaintext = "hello world"
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    test("produces different ciphertext each time due to random IV", () => {
      const plaintext = "same text"
      const encrypted1 = encrypt(plaintext)
      const encrypted2 = encrypt(plaintext)

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)

      expect(decrypt(encrypted1)).toBe(plaintext)
      expect(decrypt(encrypted2)).toBe(plaintext)
    })

    test("encrypts empty string", () => {
      const encrypted = encrypt("")
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe("")
    })

    test("encrypts long text", () => {
      const plaintext = "a".repeat(10000)
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    test("encrypts unicode characters (Japanese)", () => {
      const plaintext = "こんにちは世界"
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    test("encrypts emoji", () => {
      const plaintext = "Hello 🌍🔐💻"
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    test("encrypts JSON string", () => {
      const obj = { apiKey: "secret-123", password: "p@ssw0rd" }
      const plaintext = JSON.stringify(obj)
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(JSON.parse(decrypted)).toEqual(obj)
    })

    test("encrypts special characters", () => {
      const plaintext = "!@#$%^&*()_+-=[]{}|;':\",./<>?\n\t\r"
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    test("encrypted value has correct structure", () => {
      const encrypted = encrypt("test")
      expect(encrypted).toHaveProperty("ciphertext")
      expect(encrypted).toHaveProperty("iv")
      expect(encrypted).toHaveProperty("tag")
      expect(typeof encrypted.ciphertext).toBe("string")
      expect(typeof encrypted.iv).toBe("string")
      expect(typeof encrypted.tag).toBe("string")
    })

    test("IV is 12 bytes (16 chars base64)", () => {
      const encrypted = encrypt("test")
      const ivBuffer = Buffer.from(encrypted.iv, "base64")
      expect(ivBuffer.length).toBe(12)
    })

    test("auth tag is 16 bytes", () => {
      const encrypted = encrypt("test")
      const tagBuffer = Buffer.from(encrypted.tag, "base64")
      expect(tagBuffer.length).toBe(16)
    })
  })

  describe("decrypt with tampered data", () => {
    beforeAll(() => {
      initEncryption(validKey)
    })

    test("throws error when ciphertext is tampered", () => {
      const encrypted = encrypt("secret data")
      const tampered = {
        ...encrypted,
        ciphertext: "tampered" + encrypted.ciphertext.slice(8),
      }
      expect(() => decrypt(tampered)).toThrow()
    })

    test("throws error when IV is tampered", () => {
      const encrypted = encrypt("secret data")
      const differentIv = Buffer.from("b".repeat(12)).toString("base64")
      const tampered = { ...encrypted, iv: differentIv }
      expect(() => decrypt(tampered)).toThrow()
    })

    test("throws error when auth tag is tampered", () => {
      const encrypted = encrypt("secret data")
      const differentTag = Buffer.from("c".repeat(16)).toString("base64")
      const tampered = { ...encrypted, tag: differentTag }
      expect(() => decrypt(tampered)).toThrow()
    })

    test("throws error with empty ciphertext", () => {
      const encrypted = encrypt("test")
      const tampered = { ...encrypted, ciphertext: "" }
      expect(() => decrypt(tampered)).toThrow()
    })
  })

  describe("isEncryptedValue", () => {
    beforeAll(() => {
      initEncryption(validKey)
    })

    test("returns true for valid encrypted value", () => {
      const encrypted = encrypt("test")
      expect(isEncryptedValue(encrypted)).toBe(true)
    })

    test("returns false for null", () => {
      expect(isEncryptedValue(null)).toBe(false)
    })

    test("returns false for undefined", () => {
      expect(isEncryptedValue(undefined)).toBe(false)
    })

    test("returns false for primitive string", () => {
      expect(isEncryptedValue("just a string")).toBe(false)
    })

    test("returns false for number", () => {
      expect(isEncryptedValue(123)).toBe(false)
    })

    test("returns false for array", () => {
      expect(isEncryptedValue(["ciphertext", "iv", "tag"])).toBe(false)
    })

    test("returns false for object missing ciphertext", () => {
      expect(isEncryptedValue({ iv: "abc", tag: "def" })).toBe(false)
    })

    test("returns false for object missing iv", () => {
      expect(isEncryptedValue({ ciphertext: "abc", tag: "def" })).toBe(false)
    })

    test("returns false for object missing tag", () => {
      expect(isEncryptedValue({ ciphertext: "abc", iv: "def" })).toBe(false)
    })

    test("returns false when ciphertext is not a string", () => {
      expect(isEncryptedValue({ ciphertext: 123, iv: "abc", tag: "def" })).toBe(false)
    })

    test("returns false when iv is not a string", () => {
      expect(isEncryptedValue({ ciphertext: "abc", iv: 123, tag: "def" })).toBe(false)
    })

    test("returns false when tag is not a string", () => {
      expect(isEncryptedValue({ ciphertext: "abc", iv: "def", tag: 123 })).toBe(false)
    })

    test("returns true for manually constructed valid shape", () => {
      const manualValue = {
        ciphertext: "someBase64Data",
        iv: "someIvData",
        tag: "someTagData",
      }
      expect(isEncryptedValue(manualValue)).toBe(true)
    })
  })
})
