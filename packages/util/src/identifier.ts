export function generateSlug(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("")
}

export function generateRandomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz"
  const alphanumeric = chars + "0123456789"
  let id = chars[Math.floor(Math.random() * chars.length)]
  for (let i = 0; i < 11; i++) {
    id += alphanumeric[Math.floor(Math.random() * alphanumeric.length)]
  }
  return id
}

const RESERVED_SLUG_PATTERNS = [/^synatra/i]

const RESERVED_SLUGS = new Set(["context", "params", "payload", "console", "global", "system", "internal"])

export function isReservedSlug(slug: string): boolean {
  const normalized = slug.replace(/_/g, "").toLowerCase()
  if (RESERVED_SLUGS.has(normalized)) return true
  for (const pattern of RESERVED_SLUG_PATTERNS) {
    if (pattern.test(slug.replace(/_/g, ""))) return true
  }
  return false
}
