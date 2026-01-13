import { describe, test, expect } from "vitest"
import { SsrfError, validateExternalUrl } from "../url"

describe("Url", () => {
  describe("validateExternalUrl", () => {
    describe("blocks internal IPv4 addresses", () => {
      test("blocks localhost", async () => {
        await expect(validateExternalUrl("http://localhost/api")).rejects.toThrow(SsrfError)
      })

      test("blocks 127.0.0.1 (loopback)", async () => {
        await expect(validateExternalUrl("http://127.0.0.1/api")).rejects.toThrow(SsrfError)
      })

      test("blocks 127.x.x.x range", async () => {
        await expect(validateExternalUrl("http://127.255.255.255/api")).rejects.toThrow(SsrfError)
      })

      test("blocks 10.x.x.x (private)", async () => {
        await expect(validateExternalUrl("http://10.0.0.1/api")).rejects.toThrow(SsrfError)
        await expect(validateExternalUrl("http://10.255.255.255/api")).rejects.toThrow(SsrfError)
      })

      test("blocks 172.16-31.x.x (private)", async () => {
        await expect(validateExternalUrl("http://172.16.0.1/api")).rejects.toThrow(SsrfError)
        await expect(validateExternalUrl("http://172.31.255.255/api")).rejects.toThrow(SsrfError)
      })

      test("allows 172.15.x.x (not in private range)", async () => {
        await expect(validateExternalUrl("http://172.15.0.1/api")).resolves.toBeUndefined()
      })

      test("allows 172.32.x.x (not in private range)", async () => {
        await expect(validateExternalUrl("http://172.32.0.1/api")).resolves.toBeUndefined()
      })

      test("blocks 192.168.x.x (private)", async () => {
        await expect(validateExternalUrl("http://192.168.0.1/api")).rejects.toThrow(SsrfError)
        await expect(validateExternalUrl("http://192.168.255.255/api")).rejects.toThrow(SsrfError)
      })

      test("blocks 169.254.x.x (link-local / AWS metadata)", async () => {
        await expect(validateExternalUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SsrfError)
        await expect(validateExternalUrl("http://169.254.0.1/api")).rejects.toThrow(SsrfError)
      })

      test("blocks 0.x.x.x", async () => {
        await expect(validateExternalUrl("http://0.0.0.0/api")).rejects.toThrow(SsrfError)
      })

      test("blocks 100.64-127.x.x (CGNAT)", async () => {
        await expect(validateExternalUrl("http://100.64.0.1/api")).rejects.toThrow(SsrfError)
        await expect(validateExternalUrl("http://100.127.255.255/api")).rejects.toThrow(SsrfError)
      })

      test("allows 100.63.x.x (not in CGNAT range)", async () => {
        await expect(validateExternalUrl("http://100.63.0.1/api")).resolves.toBeUndefined()
      })

      test("blocks multicast 224.x.x.x", async () => {
        await expect(validateExternalUrl("http://224.0.0.1/api")).rejects.toThrow(SsrfError)
      })

      test("blocks reserved 240.x.x.x", async () => {
        await expect(validateExternalUrl("http://240.0.0.1/api")).rejects.toThrow(SsrfError)
      })
    })

    describe("allows public IPv4 addresses", () => {
      test("allows 8.8.8.8 (Google DNS)", async () => {
        await expect(validateExternalUrl("http://8.8.8.8/api")).resolves.toBeUndefined()
      })

      test("allows 1.1.1.1 (Cloudflare DNS)", async () => {
        await expect(validateExternalUrl("http://1.1.1.1/api")).resolves.toBeUndefined()
      })

      test("allows 203.0.114.1 (public IP)", async () => {
        await expect(validateExternalUrl("http://203.0.114.1/api")).resolves.toBeUndefined()
      })
    })

    describe("blocks internal IPv6 addresses", () => {
      test("blocks ::1 (loopback)", async () => {
        await expect(validateExternalUrl("http://[::1]/api")).rejects.toThrow(SsrfError)
      })

      test("blocks fe80:: (link-local)", async () => {
        await expect(validateExternalUrl("http://[fe80::1]/api")).rejects.toThrow(SsrfError)
      })

      test("blocks fc00:: (unique local)", async () => {
        await expect(validateExternalUrl("http://[fc00::1]/api")).rejects.toThrow(SsrfError)
      })

      test("blocks fd00:: (unique local)", async () => {
        await expect(validateExternalUrl("http://[fd00::1]/api")).rejects.toThrow(SsrfError)
      })
    })

    describe("blocks IPv4-mapped IPv6 addresses", () => {
      test("blocks ::ffff:127.0.0.1 (loopback)", async () => {
        await expect(validateExternalUrl("http://[::ffff:127.0.0.1]/api")).rejects.toThrow(SsrfError)
      })

      test("blocks ::ffff:10.0.0.1 (private)", async () => {
        await expect(validateExternalUrl("http://[::ffff:10.0.0.1]/api")).rejects.toThrow(SsrfError)
      })

      test("blocks ::ffff:169.254.169.254 (AWS metadata)", async () => {
        await expect(validateExternalUrl("http://[::ffff:169.254.169.254]/api")).rejects.toThrow(SsrfError)
      })

      test("blocks ::ffff:100.64.0.1 (CGNAT)", async () => {
        await expect(validateExternalUrl("http://[::ffff:100.64.0.1]/api")).rejects.toThrow(SsrfError)
      })

      test("blocks ::ffff:0.0.0.1", async () => {
        await expect(validateExternalUrl("http://[::ffff:0.0.0.1]/api")).rejects.toThrow(SsrfError)
      })

      test("allows ::ffff:8.8.8.8 (public)", async () => {
        await expect(validateExternalUrl("http://[::ffff:8.8.8.8]/api")).resolves.toBeUndefined()
      })
    })

    describe("blocks cloud metadata hostnames", () => {
      test("blocks metadata.google.internal (GCP)", async () => {
        await expect(validateExternalUrl("http://metadata.google.internal/computeMetadata/v1/")).rejects.toThrow(
          SsrfError,
        )
      })

      test("blocks metadata (GCP shortname)", async () => {
        await expect(validateExternalUrl("http://metadata/computeMetadata/v1/")).rejects.toThrow(SsrfError)
      })

      test("blocks kubernetes.default.svc", async () => {
        await expect(validateExternalUrl("http://kubernetes.default.svc/api")).rejects.toThrow(SsrfError)
      })

      test("blocks any .internal domain", async () => {
        await expect(validateExternalUrl("http://some-service.internal/api")).rejects.toThrow(SsrfError)
      })
    })

    describe("blocks unresolvable hostnames", () => {
      test("blocks hostname that cannot be resolved", async () => {
        await expect(
          validateExternalUrl("http://this-domain-definitely-does-not-exist-12345.invalid/api"),
        ).rejects.toThrow(SsrfError)
      })

      test("error message mentions failed resolution", async () => {
        try {
          await validateExternalUrl("http://nonexistent-host-xyz.invalid/api")
          expect.fail("Should have thrown")
        } catch (e) {
          expect((e as Error).message).toContain("Failed to resolve")
        }
      })
    })

    describe("SsrfError", () => {
      test("error has correct name", async () => {
        try {
          await validateExternalUrl("http://127.0.0.1/api")
          expect.fail("Should have thrown")
        } catch (e) {
          expect(e).toBeInstanceOf(SsrfError)
          expect((e as Error).name).toBe("SsrfError")
        }
      })

      test("error message includes IP address", async () => {
        try {
          await validateExternalUrl("http://10.0.0.1/api")
          expect.fail("Should have thrown")
        } catch (e) {
          expect((e as Error).message).toContain("10.0.0.1")
        }
      })
    })
  })
})
