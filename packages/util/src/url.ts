import dns from "dns/promises"
import { isIP } from "net"

const BLOCKED_IPV4 = [
  /^127\./, // 127.0.0.0/8 (loopback)
  /^10\./, // 10.0.0.0/8 (private)
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12 (private)
  /^192\.168\./, // 192.168.0.0/16 (private)
  /^169\.254\./, // 169.254.0.0/16 (link-local, AWS metadata)
  /^0\./, // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  /^192\.0\.0\./, // 192.0.0.0/24 (IETF protocol)
  /^192\.0\.2\./, // 192.0.2.0/24 (TEST-NET-1)
  /^198\.51\.100\./, // 198.51.100.0/24 (TEST-NET-2)
  /^203\.0\.113\./, // 203.0.113.0/24 (TEST-NET-3)
  /^224\./, // 224.0.0.0/4 (multicast)
  /^240\./, // 240.0.0.0/4 (reserved)
]

const BLOCKED_IPV6 = [
  /^::1$/, // loopback
  /^fe80:/i, // link-local
  /^fc/i, // unique local (fc00::/7)
  /^fd/i, // unique local (fc00::/7)
]

function parseIpv4FromMapped(ip: string): string | null {
  const dotted = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (dotted) return dotted[1]

  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (hex) {
    const high = parseInt(hex[1], 16)
    const low = parseInt(hex[2], 16)
    return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
  }
  return null
}

function isBlockedIpv4Mapped(ip: string): boolean {
  const ipv4 = parseIpv4FromMapped(ip)
  if (!ipv4) return false
  return BLOCKED_IPV4.some((r) => r.test(ipv4))
}

function isBlockedIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    return BLOCKED_IPV4.some((r) => r.test(ip))
  }
  if (isIP(ip) === 6) {
    if (BLOCKED_IPV6.some((r) => r.test(ip))) return true
    if (isBlockedIpv4Mapped(ip)) return true
    return false
  }
  return false
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SsrfError"
  }
}

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal", // GCP metadata
  "metadata", // GCP metadata shortname
  "kubernetes.default.svc", // Kubernetes API
  "kubernetes.default", // Kubernetes API
  "db", // common internal db alias
  "redis", // common internal redis alias
  "postgres", // common internal postgres alias
  "mysql", // common internal mysql alias
]

function getRenderServicePrefix(): string | null {
  const serviceName = process.env.RENDER_SERVICE_NAME
  if (!serviceName) return null
  const lastHyphen = serviceName.lastIndexOf("-")
  if (lastHyphen === -1) return null
  return serviceName.slice(0, lastHyphen + 1)
}

function isBlockedHostname(host: string): boolean {
  if (BLOCKED_HOSTNAMES.includes(host)) return true
  if (host.endsWith(".internal")) return true
  if (host.endsWith("-discovery")) return true
  const renderPrefix = getRenderServicePrefix()
  if (renderPrefix && host.startsWith(renderPrefix)) return true
  return false
}

async function resolveHostAddresses(host: string): Promise<string[]> {
  const results = await dns.lookup(host, { all: true }).catch(() => [])
  return results.map((r) => r.address)
}

export async function validateExternalUrl(urlString: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") return

  const url = new URL(urlString)
  const rawHost = url.hostname.toLowerCase()
  const host = rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost

  if (isBlockedHostname(host)) {
    throw new SsrfError(`Access to ${host} is not allowed`)
  }

  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new SsrfError(`Access to internal IP ${host} is not allowed`)
    }
    return
  }

  const addresses = await resolveHostAddresses(host)

  if (addresses.length === 0) {
    throw new SsrfError(`Failed to resolve hostname: ${host}`)
  }

  for (const ip of addresses) {
    if (isBlockedIp(ip)) {
      throw new SsrfError(`Access to internal IP ${ip} (resolved from ${host}) is not allowed`)
    }
  }
}

export async function validateHost(host: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") return

  const normalized = host.toLowerCase()

  if (isBlockedHostname(normalized)) {
    throw new SsrfError(`Access to ${host} is not allowed`)
  }

  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new SsrfError(`Access to internal IP ${host} is not allowed`)
    }
    return
  }

  const addresses = await resolveHostAddresses(normalized)

  if (addresses.length === 0) {
    throw new SsrfError(`Failed to resolve hostname: ${host}`)
  }

  for (const ip of addresses) {
    if (isBlockedIp(ip)) {
      throw new SsrfError(`Access to internal IP ${ip} (resolved from ${host}) is not allowed`)
    }
  }
}
