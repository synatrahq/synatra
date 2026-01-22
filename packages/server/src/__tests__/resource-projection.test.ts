import { describe, test, expect, beforeAll } from "vitest"
import { encrypt, initEncryption } from "@synatra/util/crypto"
import {
  ENCRYPTED_PLACEHOLDER,
  type StoredPostgresConfig,
  type StoredStripeConfig,
  type StoredRestApiConfig,
  type StoredSynatraAiConfig,
  type APIPostgresConfig,
  type APIStripeConfig,
  type APIRestApiConfig,
  type APISynatraAiConfig,
} from "@synatra/core/types"
import { toAPIResourceConfig } from "../routes/resources/projection"

const validKey = Buffer.from("a".repeat(32)).toString("base64")

describe("toAPIResourceConfig", () => {
  beforeAll(() => {
    initEncryption(validKey)
  })

  describe("postgres/mysql", () => {
    test("returns placeholder for encrypted password", () => {
      const stored: StoredPostgresConfig = {
        host: "localhost",
        port: 5432,
        database: "mydb",
        user: "admin",
        password: encrypt("secret"),
        ssl: true,
        sslVerification: "full",
        caCertificate: null,
        caCertificateFilename: null,
        clientCertificate: null,
        clientCertificateFilename: null,
        clientKey: null,
        clientKeyFilename: null,
      }

      const result = toAPIResourceConfig("postgres", stored) as APIPostgresConfig

      expect(result).toEqual({
        host: "localhost",
        port: 5432,
        database: "mydb",
        user: "admin",
        password: ENCRYPTED_PLACEHOLDER,
        ssl: true,
        sslVerification: "full",
        caCertificate: null,
        caCertificateFilename: null,
        clientCertificate: null,
        clientCertificateFilename: null,
        clientKey: null,
        clientKeyFilename: null,
      })
    })

    test("returns empty string for null password", () => {
      const stored: StoredPostgresConfig = {
        host: "localhost",
        port: 5432,
        database: "mydb",
        user: "admin",
        password: null,
        ssl: false,
        sslVerification: "full",
        caCertificate: null,
        caCertificateFilename: null,
        clientCertificate: null,
        clientCertificateFilename: null,
        clientKey: null,
        clientKeyFilename: null,
      }

      const result = toAPIResourceConfig("postgres", stored) as APIPostgresConfig
      expect(result.password).toBe("")
    })

    test("returns placeholder for encrypted certificates", () => {
      const stored: StoredPostgresConfig = {
        host: "localhost",
        port: 5432,
        database: "mydb",
        user: "admin",
        password: encrypt("secret"),
        ssl: true,
        sslVerification: "full",
        caCertificate: encrypt("ca-cert"),
        caCertificateFilename: "ca.pem",
        clientCertificate: encrypt("client-cert"),
        clientCertificateFilename: "client.pem",
        clientKey: encrypt("client-key"),
        clientKeyFilename: "client.key",
      }

      const result = toAPIResourceConfig("mysql", stored) as APIPostgresConfig

      expect(result.password).toBe(ENCRYPTED_PLACEHOLDER)
      expect(result.caCertificate).toBe(ENCRYPTED_PLACEHOLDER)
      expect(result.caCertificateFilename).toBe("ca.pem")
      expect(result.clientCertificate).toBe(ENCRYPTED_PLACEHOLDER)
      expect(result.clientCertificateFilename).toBe("client.pem")
      expect(result.clientKey).toBe(ENCRYPTED_PLACEHOLDER)
      expect(result.clientKeyFilename).toBe("client.key")
    })
  })

  describe("stripe", () => {
    test("returns placeholder for encrypted apiKey", () => {
      const stored: StoredStripeConfig = {
        apiKey: encrypt("sk_live_xxx"),
        apiVersion: "2024-01-01",
      }

      const result = toAPIResourceConfig("stripe", stored) as APIStripeConfig

      expect(result).toEqual({
        apiKey: ENCRYPTED_PLACEHOLDER,
        apiVersion: "2024-01-01",
      })
    })

    test("returns empty string for null apiKey", () => {
      const stored: StoredStripeConfig = {
        apiKey: null,
        apiVersion: "2024-01-01",
      }

      const result = toAPIResourceConfig("stripe", stored) as APIStripeConfig
      expect(result.apiKey).toBe("")
    })
  })

  describe("restapi", () => {
    test("returns placeholder for encrypted authConfig", () => {
      const stored: StoredRestApiConfig = {
        baseUrl: "https://api.example.com",
        authType: "bearer",
        authConfig: encrypt(JSON.stringify({ type: "bearer", token: "secret" })),
        headers: {},
        queryParams: {},
      }

      const result = toAPIResourceConfig("restapi", stored) as APIRestApiConfig

      expect(result).toEqual({
        baseUrl: "https://api.example.com",
        authType: "bearer",
        authConfig: ENCRYPTED_PLACEHOLDER,
        authLocation: undefined,
        authName: undefined,
        headers: {},
        queryParams: {},
      })
    })

    test("returns empty string for null authConfig", () => {
      const stored: StoredRestApiConfig = {
        baseUrl: "https://api.example.com",
        authType: "none",
        authConfig: null,
        headers: {},
        queryParams: {},
      }

      const result = toAPIResourceConfig("restapi", stored) as APIRestApiConfig
      expect(result.authConfig).toBe("")
    })

    test("preserves authLocation and authName for api_key type", () => {
      const stored: StoredRestApiConfig = {
        baseUrl: "https://api.example.com",
        authType: "api_key",
        authConfig: encrypt(JSON.stringify({ type: "api_key", key: "secret" })),
        authLocation: "header",
        authName: "X-API-Key",
        headers: {},
        queryParams: {},
      }

      const result = toAPIResourceConfig("restapi", stored) as APIRestApiConfig

      expect(result.authLocation).toBe("header")
      expect(result.authName).toBe("X-API-Key")
    })
  })

  describe("synatra_ai", () => {
    test("returns placeholder for encrypted provider apiKeys", () => {
      const stored: StoredSynatraAiConfig = {
        openai: {
          apiKey: encrypt("sk-xxx"),
          baseUrl: null,
          enabled: true,
        },
        anthropic: {
          apiKey: encrypt("sk-ant-xxx"),
          baseUrl: "https://custom.anthropic.com",
          enabled: false,
        },
        google: null,
      }

      const result = toAPIResourceConfig("synatra_ai", stored) as APISynatraAiConfig

      expect(result.openai).toEqual({
        apiKey: ENCRYPTED_PLACEHOLDER,
        baseUrl: null,
        enabled: true,
      })
      expect(result.anthropic).toEqual({
        apiKey: ENCRYPTED_PLACEHOLDER,
        baseUrl: "https://custom.anthropic.com",
        enabled: false,
      })
      expect(result.google).toBeNull()
    })

    test("returns empty string for provider without apiKey", () => {
      const stored: StoredSynatraAiConfig = {
        openai: {
          apiKey: encrypt(""),
          baseUrl: null,
          enabled: true,
        },
        anthropic: null,
        google: null,
      }

      const result = toAPIResourceConfig("synatra_ai", stored) as APISynatraAiConfig

      expect(result.openai?.apiKey).toBe(ENCRYPTED_PLACEHOLDER)
    })
  })

  describe("github/intercom", () => {
    test("returns appAccountId unchanged", () => {
      const stored = { appAccountId: "app-123" }

      expect(toAPIResourceConfig("github", stored)).toEqual({ appAccountId: "app-123" })
      expect(toAPIResourceConfig("intercom", stored)).toEqual({ appAccountId: "app-123" })
    })
  })
})
