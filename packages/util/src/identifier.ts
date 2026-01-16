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
