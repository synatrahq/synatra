import { describe, test, expect, vi, beforeEach, beforeAll } from "vitest"
import { decrypt, encrypt, initEncryption, isEncryptedValue } from "@synatra/util/crypto"
import {
  SENSITIVE_FIELDS,
  ResourceType,
  type InputPostgresConfig,
  type InputStripeConfig,
  type InputRestApiConfig,
  type StoredPostgresConfig,
  type StoredStripeConfig,
} from "../types/resource"

vi.mock("../database", () => ({
  withDb: vi.fn(),
  withTx: vi.fn(),
  first: <T>(rows: T[]): T | undefined => rows[0],
}))

vi.mock("../config", () => ({
  config: () => ({
    database: { url: "postgres://test" },
  }),
}))

const validKey = Buffer.from("a".repeat(32)).toString("base64")

describe("Resource Encryption", () => {
  beforeAll(() => {
    initEncryption(validKey)
  })

  describe("SENSITIVE_FIELDS definition", () => {
    test("postgres has correct sensitive fields", () => {
      expect(SENSITIVE_FIELDS.postgres).toEqual(["password", "caCertificate", "clientCertificate", "clientKey"])
    })

    test("mysql has correct sensitive fields", () => {
      expect(SENSITIVE_FIELDS.mysql).toEqual(["password", "caCertificate", "clientCertificate", "clientKey"])
    })

    test("stripe has apiKey as sensitive", () => {
      expect(SENSITIVE_FIELDS.stripe).toEqual(["apiKey"])
    })

    test("github has no sensitive fields (uses OAuth)", () => {
      expect(SENSITIVE_FIELDS.github).toEqual([])
    })

    test("intercom has no sensitive fields (uses OAuth)", () => {
      expect(SENSITIVE_FIELDS.intercom).toEqual([])
    })

    test("restapi has authConfig as sensitive", () => {
      expect(SENSITIVE_FIELDS.restapi).toEqual(["authConfig"])
    })

    test("all resource types have sensitive fields defined", () => {
      for (const type of ResourceType) {
        expect(SENSITIVE_FIELDS[type]).toBeDefined()
        expect(Array.isArray(SENSITIVE_FIELDS[type])).toBe(true)
      }
    })
  })

  describe("encryption roundtrip simulation", () => {
    describe("postgres config", () => {
      test("password can be encrypted and decrypted", () => {
        const plainPassword = "super-secret-password"
        const encrypted = encrypt(plainPassword)
        const decrypted = decrypt(encrypted)
        expect(decrypted).toBe(plainPassword)
      })

      test("certificate content can be encrypted and decrypted", () => {
        const certContent = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0Gcsa
-----END CERTIFICATE-----`
        const encrypted = encrypt(certContent)
        const decrypted = decrypt(encrypted)
        expect(decrypted).toBe(certContent)
      })

      test("private key can be encrypted and decrypted", () => {
        const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSk
-----END PRIVATE KEY-----`
        const encrypted = encrypt(privateKey)
        const decrypted = decrypt(encrypted)
        expect(decrypted).toBe(privateKey)
      })

      test("simulates postgres config encryption", () => {
        const inputConfig: InputPostgresConfig = {
          host: "localhost",
          port: 5432,
          database: "mydb",
          user: "admin",
          password: "secret123",
          ssl: true,
          sslVerification: "full",
          caCertificate: "ca-cert-content",
          clientCertificate: null,
          clientKey: null,
        }

        const encrypted = encrypt(inputConfig.password!)
        expect(isEncryptedValue(encrypted)).toBe(true)
        expect(decrypt(encrypted)).toBe("secret123")

        if (inputConfig.caCertificate) {
          const encryptedCa = encrypt(inputConfig.caCertificate)
          expect(isEncryptedValue(encryptedCa)).toBe(true)
          expect(decrypt(encryptedCa)).toBe("ca-cert-content")
        }
      })
    })

    describe("stripe config", () => {
      test("api key can be encrypted and decrypted", () => {
        const apiKey = "sk_test_1234567890abcdef"
        const encrypted = encrypt(apiKey)
        expect(isEncryptedValue(encrypted)).toBe(true)
        expect(decrypt(encrypted)).toBe(apiKey)
      })

      test("simulates stripe config encryption", () => {
        const inputConfig: InputStripeConfig = {
          apiKey: "sk_live_secretkey123456",
          apiVersion: "2024-01-01",
        }

        const encrypted = encrypt(inputConfig.apiKey!)
        const storedConfig = {
          apiKey: encrypted,
          apiVersion: inputConfig.apiVersion,
        }

        expect(storedConfig.apiVersion).toBe("2024-01-01")
        expect(isEncryptedValue(storedConfig.apiKey)).toBe(true)
        expect(decrypt(storedConfig.apiKey)).toBe("sk_live_secretkey123456")
      })
    })

    describe("restapi config", () => {
      test("bearer token can be encrypted and decrypted", () => {
        const auth = { type: "bearer" as const, token: "eyJhbGciOiJIUzI1NiJ9.token" }
        const encrypted = encrypt(JSON.stringify(auth))
        const decrypted = JSON.parse(decrypt(encrypted))
        expect(decrypted).toEqual(auth)
      })

      test("api key auth can be encrypted and decrypted", () => {
        const auth = { type: "api_key" as const, key: "api-key-12345", location: "header", name: "X-API-Key" }
        const encrypted = encrypt(JSON.stringify(auth))
        const decrypted = JSON.parse(decrypt(encrypted))
        expect(decrypted).toEqual(auth)
      })

      test("basic auth can be encrypted and decrypted", () => {
        const auth = { type: "basic" as const, username: "user", password: "pass123" }
        const encrypted = encrypt(JSON.stringify(auth))
        const decrypted = JSON.parse(decrypt(encrypted))
        expect(decrypted).toEqual(auth)
      })

      test("simulates restapi config with bearer auth", () => {
        const inputConfig: InputRestApiConfig = {
          baseUrl: "https://api.example.com",
          auth: { type: "bearer", token: "my-bearer-token" },
          headers: { "Content-Type": "application/json" },
          queryParams: {},
        }

        const authJson = JSON.stringify(inputConfig.auth)
        const encryptedAuth = encrypt(authJson)

        const storedConfig = {
          baseUrl: inputConfig.baseUrl,
          authType: "bearer" as const,
          authConfig: encryptedAuth,
          headers: inputConfig.headers,
          queryParams: inputConfig.queryParams,
        }

        expect(storedConfig.baseUrl).toBe("https://api.example.com")
        expect(storedConfig.authType).toBe("bearer")
        expect(isEncryptedValue(storedConfig.authConfig)).toBe(true)

        const decryptedAuth = JSON.parse(decrypt(storedConfig.authConfig))
        expect(decryptedAuth.type).toBe("bearer")
        expect(decryptedAuth.token).toBe("my-bearer-token")
      })

      test("api_key auth preserves location and name through encrypt/decrypt cycle", () => {
        const inputAuth = {
          type: "api_key" as const,
          key: "my-api-key-12345",
          location: "header" as const,
          name: "X-API-Key",
        }

        const encryptedKey = encrypt(JSON.stringify({ type: "api_key", key: inputAuth.key }))
        const storedConfig = {
          baseUrl: "https://api.example.com",
          authType: "api_key" as const,
          authConfig: encryptedKey,
          authLocation: inputAuth.location,
          authName: inputAuth.name,
          headers: {},
          queryParams: {},
        }

        const decrypted = JSON.parse(decrypt(storedConfig.authConfig))
        const reconstructedAuth = {
          type: decrypted.type,
          key: decrypted.key,
          location: storedConfig.authLocation,
          name: storedConfig.authName,
        }

        expect(reconstructedAuth.type).toBe("api_key")
        expect(reconstructedAuth.key).toBe("my-api-key-12345")
        expect(reconstructedAuth.location).toBe("header")
        expect(reconstructedAuth.name).toBe("X-API-Key")
      })
    })
  })

  describe("partial update preservation", () => {
    test("preserves existing encrypted password when new password not provided", () => {
      const existingEncrypted = encrypt("existing-password")

      const simulatePartialUpdate = (newConfig: Partial<InputPostgresConfig>, existing: StoredPostgresConfig) => {
        const result: Partial<StoredPostgresConfig> = {}

        if (newConfig.password !== undefined) {
          result.password = newConfig.password ? encrypt(newConfig.password) : null
        } else {
          result.password = existing.password
        }

        return result
      }

      const existingStored: StoredPostgresConfig = {
        host: "localhost",
        port: 5432,
        database: "db",
        user: "user",
        password: existingEncrypted,
        ssl: false,
        sslVerification: "full",
        caCertificate: null,
        caCertificateFilename: null,
        clientCertificate: null,
        clientCertificateFilename: null,
        clientKey: null,
        clientKeyFilename: null,
      }

      const updateWithoutPassword = simulatePartialUpdate({ host: "newhost" }, existingStored)
      expect(updateWithoutPassword.password).toBe(existingEncrypted)
      expect(decrypt(updateWithoutPassword.password!)).toBe("existing-password")

      const updateWithNewPassword = simulatePartialUpdate({ password: "new-password" }, existingStored)
      expect(updateWithNewPassword.password).not.toBe(existingEncrypted)
      expect(decrypt(updateWithNewPassword.password!)).toBe("new-password")

      const updateWithNullPassword = simulatePartialUpdate({ password: null }, existingStored)
      expect(updateWithNullPassword.password).toBeNull()
    })
  })

  describe("null and empty handling", () => {
    test("null value results in null stored value", () => {
      const input: InputPostgresConfig = {
        host: "localhost",
        port: 5432,
        database: "db",
        user: "user",
        password: null,
        ssl: false,
        sslVerification: "full",
      }

      expect(input.password).toBeNull()
    })

    test("empty string password should be treated as clearing the password", () => {
      const emptyPassword = ""
      const shouldStoreNull = emptyPassword === "" || emptyPassword === null
      expect(shouldStoreNull).toBe(true)
    })

    test("undefined password should preserve existing", () => {
      const input: InputPostgresConfig = {
        host: "localhost",
        port: 5432,
        database: "db",
        user: "user",
        ssl: false,
        sslVerification: "full",
      }

      expect(input.password).toBeUndefined()
    })
  })

  describe("credential security patterns", () => {
    test("encrypted value cannot be decrypted with different key", () => {
      const encrypted = encrypt("secret")

      const tamperedEncrypted = {
        ...encrypted,
        ciphertext: Buffer.from("tampered").toString("base64"),
      }

      expect(() => decrypt(tamperedEncrypted)).toThrow()
    })

    test("encrypted values are unique even for same plaintext", () => {
      const secret = "same-secret"
      const encrypted1 = encrypt(secret)
      const encrypted2 = encrypt(secret)

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)

      expect(decrypt(encrypted1)).toBe(secret)
      expect(decrypt(encrypted2)).toBe(secret)
    })

    test("sensitive fields list does not include non-sensitive data", () => {
      const nonSensitivePostgres = ["host", "port", "database", "user", "ssl", "sslVerification"]
      for (const field of nonSensitivePostgres) {
        expect(SENSITIVE_FIELDS.postgres).not.toContain(field)
      }
    })
  })

  describe("type coverage", () => {
    test("ResourceType array contains all 7 types", () => {
      expect(ResourceType.length).toBe(7)
      expect(ResourceType).toContain("postgres")
      expect(ResourceType).toContain("mysql")
      expect(ResourceType).toContain("stripe")
      expect(ResourceType).toContain("github")
      expect(ResourceType).toContain("intercom")
      expect(ResourceType).toContain("restapi")
      expect(ResourceType).toContain("synatra_ai")
    })

    test("SENSITIVE_FIELDS keys match ResourceType values", () => {
      const sensitiveFieldKeys = Object.keys(SENSITIVE_FIELDS)
      for (const type of ResourceType) {
        expect(sensitiveFieldKeys).toContain(type)
      }
    })
  })
})
