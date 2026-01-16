export function generateSlug(name: string): string {
  const slug = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("")

  if (slug) return slug

  const chars = "abcdefghijklmnopqrstuvwxyz"
  const alphanumeric = chars + "0123456789"
  let fallback = chars[Math.floor(Math.random() * chars.length)]
  for (let i = 0; i < 11; i++) {
    fallback += alphanumeric[Math.floor(Math.random() * alphanumeric.length)]
  }
  return fallback
}
